"""Contract tests use synthetic messages and MockTransport; no live sends or PHI."""
import ast
from email import message_from_bytes, policy
from email.header import decode_header
import hashlib
import json
from pathlib import Path
import sys
import unittest

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "shared"))
from business_mail import BusinessMailError, ZohoConfig, ZohoMail
from dropbox_archive import DropboxArchive, DropboxConfig, content_hash


MAIL = ZohoConfig("client", "secret", "refresh", "123", "patients@strykefox.com", "456")
BOX = DropboxConfig("client", "secret", "refresh", "789", "/2. SFM/Test Intake")


def ok(data=None, **kwargs):
    return httpx.Response(200, json={"status": {"code": 200}, "data": data, **kwargs})


class MailTests(unittest.IsolatedAsyncioTestCase):
    async def run_mail(self, action, override=None):
        calls = []
        def handler(request):
            calls.append(request)
            if override:
                response = override(request)
                if response is not None:
                    return response
            path = request.url.path
            if path.endswith("/token"):
                return httpx.Response(200, json={"access_token": "test-token"})
            self.assertEqual(request.headers["Authorization"], "Zoho-oauthtoken test-token")
            if path == "/api/accounts":
                return ok([{"accountId": "123", "primaryEmailAddress": MAIL.email}])
            if path.endswith("/messages/view"):
                self.assertEqual(request.url.params["folderId"], "456")
                self.assertEqual(request.url.params["status"], "unread")
                return ok([{"messageId": "999", "folderId": "456"}])
            if path.endswith("/originalmessage"):
                return ok({"content": "Message-ID: <synthetic@example.test>\r\nSubject: Test\r\n\r\nBody"})
            if path.endswith("/updatemessage"):
                self.assertEqual(request.method, "PUT")
                self.assertEqual(json.loads(request.content), {"mode": "markAsRead", "messageId": [999]})
                return httpx.Response(200, json={"status": {"code": 200}})
            self.fail(f"Unexpected request: {request.method} {path}")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await action(ZohoMail(client, MAIL))
        self.assertTrue(all("google" not in r.url.host for r in calls))
        return result, calls

    async def test_read_is_zoho_only_and_does_not_mark_read(self):
        result, calls = await self.run_mail(lambda mail: mail.fetch_messages("INBOX", "UNSEEN", 10))
        self.assertEqual(result[0]["provider_id"], "999")
        self.assertIn(b"<synthetic@example.test>", result[0]["raw"])
        self.assertFalse(any(r.method == "PUT" for r in calls))

    async def test_wrong_account_stops_before_messages(self):
        with self.assertRaisesRegex(BusinessMailError, "does not match"):
            await self.run_mail(lambda mail: mail.fetch_messages("INBOX", "UNSEEN", 10),
                lambda r: ok([{"accountId": "123", "primaryEmailAddress": "other@example.test"}])
                if r.url.path == "/api/accounts" else None)

    async def test_zoho_error_inside_http_200_is_failure(self):
        with self.assertRaisesRegex(BusinessMailError, "failed"):
            await self.run_mail(lambda mail: mail.fetch_messages("INBOX", "UNSEEN", 10),
                lambda r: httpx.Response(200, json={"status": {"code": 500}, "data": []})
                if r.url.path.endswith("/messages/view") else None)

    async def test_missing_raw_is_not_silently_skipped(self):
        with self.assertRaisesRegex(BusinessMailError, "original message is missing"):
            await self.run_mail(lambda mail: mail.fetch_messages("INBOX", "UNSEEN", 10),
                lambda r: ok({}) if r.url.path.endswith("/originalmessage") else None)

    async def test_wrong_folder_is_failure(self):
        with self.assertRaisesRegex(BusinessMailError, "outside the verified folder"):
            await self.run_mail(lambda mail: mail.fetch_messages("INBOX", "UNSEEN", 10),
                lambda r: ok([{"messageId": "999", "folderId": "wrong"}])
                if r.url.path.endswith("/messages/view") else None)

    async def test_legacy_search_and_unmapped_mailbox_stop_before_network(self):
        for mailbox, search, count in [("INBOX", "is:unread", 10), ("OTHER", "UNSEEN", 10), ("INBOX", "UNSEEN", 201)]:
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: self.fail("Network used"))) as client:
                with self.assertRaises(BusinessMailError):
                    await ZohoMail(client, MAIL).fetch_messages(mailbox, search, count)

    async def test_mark_read_is_explicit_and_checks_response(self):
        await self.run_mail(lambda mail: mail.mark_seen("INBOX", ["999"]))
        with self.assertRaises(BusinessMailError):
            await self.run_mail(lambda mail: mail.mark_seen("INBOX", ["999"]),
                lambda r: httpx.Response(403, json={}) if r.method == "PUT" else None)

    def test_gmail_credentials_cannot_satisfy_zoho_config(self):
        with self.assertRaisesRegex(BusinessMailError, "Missing Zoho"):
            ZohoConfig.from_env({"GMAIL_OAUTH_CLIENT_ID": "old", "GMAIL_OAUTH_REFRESH_TOKEN": "old"})


class DropboxTests(unittest.IsolatedAsyncioTestCase):
    async def setup_archive(self, override=None):
        files, uploads, calls = {}, [], []
        def handler(request):
            calls.append(request)
            if override:
                response = override(request)
                if response is not None:
                    return response
            path = request.url.path
            if path.endswith("/token"):
                return httpx.Response(200, json={"access_token": "box-test-token"})
            if path.endswith("/get_current_account"):
                return httpx.Response(200, json={"root_info": {"root_namespace_id": "789"}})
            self.assertEqual(json.loads(request.headers["Dropbox-API-Path-Root"]), {".tag": "root", "root": "789"})
            if path.endswith("/get_metadata"):
                filename = json.loads(request.content)["path"]
                if filename == BOX.intake_path:
                    return httpx.Response(200, json={".tag": "folder"})
                if filename in files:
                    return httpx.Response(200, json=files[filename])
                return httpx.Response(409, json={"error_summary": "path/not_found/"})
            if path.endswith("/upload"):
                args = json.loads(request.headers["Dropbox-API-Arg"])
                self.assertEqual(args["mode"], "add")
                self.assertFalse(args["autorename"])
                self.assertTrue(args["path"].startswith(BOX.intake_path + "/"))
                self.assertEqual(args["content_hash"], content_hash(request.content))
                metadata = {"id": "id:synthetic", "rev": "rev1", "content_hash": content_hash(request.content)}
                files[args["path"]] = metadata
                uploads.append(args)
                return httpx.Response(200, json=metadata)
            self.fail(f"Unexpected request: {path}")
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        self.addAsyncCleanup(client.aclose)
        archive = DropboxArchive(client, BOX)
        await archive.authenticate()
        return archive, uploads, files, calls

    async def test_upload_readback_then_replay_does_not_upload_again(self):
        archive, uploads, _, _ = await self.setup_archive()
        first = await archive.save_attachment("mailbox:<message@example.test>", "../../synthetic.pdf", b"synthetic")
        second = await archive.save_attachment("mailbox:<message@example.test>", "../../synthetic.pdf", b"synthetic")
        self.assertEqual(first["path"], second["path"])
        self.assertNotIn("..", first["path"])
        self.assertEqual(first["rev"], "rev1")
        self.assertTrue(second["already_archived"])
        self.assertEqual(len(uploads), 1)

    async def test_wrong_namespace_blocks_storage(self):
        with self.assertRaisesRegex(BusinessMailError, "namespace does not match"):
            await self.setup_archive(lambda r: httpx.Response(200, json={"root_info": {"root_namespace_id": "wrong"}})
                if r.url.path.endswith("get_current_account") else None)

    async def test_corrupted_existing_file_is_never_overwritten(self):
        archive, uploads, files, _ = await self.setup_archive()
        first = await archive.save_attachment("source", "a.pdf", b"test")
        files[first["path"]]["content_hash"] = "wrong"
        with self.assertRaisesRegex(BusinessMailError, "hash did not verify"):
            await archive.save_attachment("source", "a.pdf", b"test")
        self.assertEqual(len(uploads), 1)

    async def test_permission_error_is_not_treated_as_missing_file(self):
        archive, uploads, _, _ = await self.setup_archive(lambda r:
            httpx.Response(403, json={"error_summary": "access_denied"})
            if r.url.path.endswith("get_metadata") and json.loads(r.content)["path"] != BOX.intake_path else None)
        with self.assertRaises(BusinessMailError):
            await archive.save_attachment("source", "a.pdf", b"test")
        self.assertEqual(uploads, [])

    async def test_ambiguous_upload_is_not_retried(self):
        attempts = []
        def timeout(r):
            if r.url.path.endswith("/upload"):
                attempts.append(r)
                raise httpx.ReadTimeout("synthetic", request=r)
        archive, _, _, _ = await self.setup_archive(timeout)
        with self.assertRaisesRegex(BusinessMailError, "result is unknown"):
            await archive.save_attachment("source", "a.pdf", b"test")
        self.assertEqual(len(attempts), 1)

    def test_multiblock_content_hash_matches_published_algorithm(self):
        content = b"a" * (4 * 1024 * 1024) + b"b"
        expected = hashlib.sha256(hashlib.sha256(content[:-1]).digest() + hashlib.sha256(b"b").digest()).hexdigest()
        self.assertEqual(content_hash(content), expected)


class MimeTests(unittest.TestCase):
    def test_inline_images_are_excluded_and_real_attachment_is_preserved(self):
        source = Path(__file__).with_name("main.py").read_text()
        tree = ast.parse(source)
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                     and node.name in {"_decode_mime_header", "_iter_email_attachments"}]
        scope = {"decode_header": decode_header}
        exec(compile(ast.Module(body=functions, type_ignores=[]), "intake-mail-functions", "exec"), scope)
        mime = (b'MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=x\r\n\r\n'
                b'--x\r\nContent-Type: image/png\r\nContent-Disposition: inline; filename="inline.png"\r\n\r\nimage\r\n'
                b'--x\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename="a.pdf"\r\n\r\nPDF\r\n--x--\r\n')
        parts = scope["_iter_email_attachments"](message_from_bytes(mime, policy=policy.default))
        self.assertEqual(parts, [("a.pdf", b"PDF")])


if __name__ == "__main__":
    unittest.main()
