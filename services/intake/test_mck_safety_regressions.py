"""Synthetic MCK regression tests. Database tests use disposable schemas only."""
from __future__ import annotations
import ast
import asyncio
import json
import os
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs
import uuid

import httpx
import psycopg
from psycopg import sql
from psycopg_pool import AsyncConnectionPool

SERVICES = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICES / "shared"))
sys.path.insert(0, str(SERVICES / "core"))
os.environ.setdefault("LOCAL_PROOF_MODE", "true")
import conveyor_api as core
from business_mail import BusinessMailError, ZohoConfig
from zoho_mail_outbound import ZohoMailSendUncertain, ZohoMailSender
from zoho_sheet import ZohoSheet, ZohoSheetConfig, ZohoSheetError, ZohoSheetWriteUncertain

ORG = "00000000-0000-0000-0000-000000000001"
ORDER = "00000000-0000-0000-0000-000000000002"
RECORD = "MCK-SYNTHETIC1"
MAIL_CONFIG = ZohoConfig("id", "secret", "refresh", "123", "patients@strykefox.com", "456")
SHEET_CONFIG = ZohoSheetConfig("id", "secret", "refresh", "synthetic-workbook")


def intake(**overrides):
    return core.MckIntakePayload(**{
        "source_reference": "synthetic:review-1", "first_name": "Synthetic",
        "last_name": "Patient", "date_of_birth": "1990-01-01",
        "email": "synthetic@example.test", "phone": "7025550100",
        "due_date": "2027-02-01", **overrides,
    })


class IdentityTests(unittest.IsolatedAsyncioTestCase):
    async def test_matching_phone_conflicting_email_is_rejected(self):
        with patch.object(core, "_all", AsyncMock(return_value=[{
            "id": ORDER, "phone": "7025550100", "email": "someoneelse@example.test"
        }])):
            with self.assertRaises(core.IdentityConflict):
                await core._resolve_patient(None, intake(), ORG)

    async def test_matching_email_conflicting_phone_is_rejected(self):
        with patch.object(core, "_all", AsyncMock(return_value=[{
            "id": ORDER, "phone": "7025559999", "email": "synthetic@example.test"
        }])):
            with self.assertRaises(core.IdentityConflict):
                await core._resolve_patient(None, intake(), ORG)

    async def test_matching_identifiers_reconcile(self):
        candidate = {"id": ORDER, "phone": "+1 (702) 555-0100", "email": "synthetic@example.test"}
        with patch.object(core, "_all", AsyncMock(return_value=[candidate])):
            self.assertEqual(await core._resolve_patient(None, intake(), ORG), candidate)

    def test_absent_state_is_preserved_as_missing(self):
        self.assertIsNone(intake().state)

    async def test_unconfirmed_spear_cannot_send_welcome(self):
        result = await core._send_welcome(None, None, intake(), org_id=ORG,
                                          record_id=RECORD, order_id=None)
        self.assertEqual(result["status"], "blocked")


class SheetTransportTests(unittest.IsolatedAsyncioTestCase):
    async def run_upsert(self, handler, **kwargs):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            sheet = ZohoSheet(client, SHEET_CONFIG)
            sheet.headers = {"Authorization": "synthetic"}
            return await sheet.upsert_record(worksheet_name="Patient Details", record_id=RECORD,
                                            values={"Patient Name": "Synthetic Patient"}, **kwargs)

    async def test_missing_list_does_not_mean_missing_patient(self):
        methods = []
        def handler(req):
            methods.append(parse_qs(req.content.decode())["method"][0])
            return httpx.Response(200, json={"status": "success"})
        with self.assertRaises(ZohoSheetError):
            await self.run_upsert(handler)
        self.assertEqual(methods, ["worksheet.records.fetch"])

    async def test_duplicate_rows_require_review_without_update(self):
        methods = []
        def handler(req):
            data = parse_qs(req.content.decode()); methods.append(data["method"][0])
            self.assertEqual(data["count"], ["2"])
            return httpx.Response(200, json={"status": "success", "records": [
                {"Record ID": RECORD}, {"Record ID": RECORD}]})
        with self.assertRaises(ZohoSheetError):
            await self.run_upsert(handler)
        self.assertEqual(methods, ["worksheet.records.fetch"])

    async def test_index_lag_with_prior_write_never_appends(self):
        methods = []
        def handler(req):
            methods.append(parse_qs(req.content.decode())["method"][0])
            return httpx.Response(200, json={"status": "success", "records": []})
        with self.assertRaises(ZohoSheetError):
            await self.run_upsert(handler, allow_create=False)
        self.assertEqual(methods, ["worksheet.records.fetch"])

    async def test_timeout_during_append_is_uncertain(self):
        methods = []
        def handler(req):
            method = parse_qs(req.content.decode())["method"][0]; methods.append(method)
            if method.endswith("fetch"):
                return httpx.Response(200, json={"records": []})
            raise httpx.ReadTimeout("synthetic", request=req)
        with self.assertRaises(ZohoSheetWriteUncertain):
            await self.run_upsert(handler)
        self.assertEqual(methods.count("worksheet.records.add"), 1)

    async def test_append_requires_positive_row_receipt(self):
        def handler(req):
            method = parse_qs(req.content.decode())["method"][0]
            return httpx.Response(200, json={"records": []} if method.endswith("fetch")
                                 else {"status": "success"})
        with self.assertRaises(ZohoSheetWriteUncertain):
            await self.run_upsert(handler)

    async def test_existing_workflow_state_is_preserved(self):
        updated = []
        def handler(req):
            params = parse_qs(req.content.decode())
            if params["method"][0].endswith("fetch"):
                return httpx.Response(200, json={"records": [{"Record ID": RECORD,
                    "SWO Status (cover)": "Received", "Notes": "Verified physician notes"}]})
            updated.append(json.loads(params["data"][0]))
            return httpx.Response(200, json={"status": "success", "no_of_affected_rows": 1})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            sheet = ZohoSheet(client, SHEET_CONFIG); sheet.headers = {"Authorization": "synthetic"}
            await sheet.upsert_record(worksheet_name="Patient Details", record_id=RECORD,
                values={"SWO Status (cover)": "Outstanding", "Notes": "New intake", "DOB": ""},
                initialize_only=("SWO Status (cover)", "Notes"))
        self.assertEqual(updated, [{"Record ID": RECORD}])

    def test_unsupported_region_fails_before_credentials_leave_server(self):
        env = {"ZOHO_OAUTH_CLIENT_ID": "id", "ZOHO_OAUTH_CLIENT_SECRET": "secret",
               "ZOHO_OAUTH_REFRESH_TOKEN": "refresh", "MCK_ZOHO_SHEET_RESOURCE_ID": "test",
               "ZOHO_REGION": "attacker.example"}
        with self.assertRaises(ZohoSheetError):
            ZohoSheetConfig.from_env(env)


class MailTransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_oauth_failure_is_retryable_and_sends_nothing(self):
        urls = []
        def handler(req):
            urls.append(str(req.url))
            return httpx.Response(503, json={"error": "synthetic"})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with self.assertRaises(BusinessMailError) as raised:
                await ZohoMailSender(client, MAIL_CONFIG).send_message(
                    to_addresses=["synthetic@example.test"], subject="Synthetic", content="Synthetic")
        self.assertNotIsInstance(raised.exception, ZohoMailSendUncertain)
        self.assertFalse(any(url.endswith("/messages") for url in urls))

    async def test_canadian_account_uses_verified_regional_hosts(self):
        hosts = []
        config = ZohoConfig("id", "secret", "refresh", "123", "patients@strykefox.com", "456", region="ca")
        def handler(req):
            hosts.append(req.url.host)
            if req.url.path.endswith("/token"):
                return httpx.Response(200, json={"access_token": "synthetic"})
            if req.url.path == "/api/accounts":
                return httpx.Response(200, json={"status": {"code": 200}, "data": [
                    {"accountId": "123", "primaryEmailAddress": "patients@strykefox.com"}]})
            return httpx.Response(200, json={"status": {"code": 200}, "data": {"messageId": "987654"}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await ZohoMailSender(client, config).send_message(
                to_addresses=["synthetic@example.test"], subject="Synthetic", content="Synthetic")
        self.assertEqual(result, "987654")
        self.assertEqual(hosts, ["accounts.zohocloud.ca", "mail.zohocloud.ca", "mail.zohocloud.ca"])


class ArchiveIsolationTests(unittest.IsolatedAsyncioTestCase):
    async def test_one_bad_archive_does_not_block_other_messages(self):
        source = (SERVICES / "intake" / "main.py").read_text()
        node = next(n for n in ast.parse(source).body if isinstance(n, ast.AsyncFunctionDef)
                    and n.name == "poll_email_intake")
        node.decorator_list = []
        module = ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[]))
        messages = [{"imap_id": mid, "message_id": mid, "subject": "Synthetic intake",
                     "from": "synthetic@example.test", "attachments": [("synthetic.csv", b"synthetic")]}
                    for mid in ("bad", "good")]
        async def archive(batch):
            self.assertEqual(len(batch), 1)
            if batch[0]["imap_id"] == "bad":
                raise BusinessMailError("Synthetic archive failure")
            batch[0]["attachment_archives"] = [{"path": "/synthetic/good"}]
        submit = AsyncMock(return_value={"results": [{"index": 0, "status": "created", "order_id": ORDER}]})
        mark_seen = AsyncMock()
        namespace = {"Request": object, "EmailPollRequest": object, "Any": object,
            "json": json, "HTTPException": core.HTTPException,
            "_fetch_email_messages": AsyncMock(return_value=messages),
            "_archive_email_messages": archive, "_parse_attachment": lambda *a: [{"synthetic": True}],
            "_submit_orders_to_core": submit, "_advance_core_order_workflow": AsyncMock(return_value={}),
            "cache_rpush": AsyncMock(), "_mark_email_messages_seen": mark_seen}
        exec(compile(module, "actual_poll_email_intake", "exec"), namespace)
        result = await namespace["poll_email_intake"](
            SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace())),
            SimpleNamespace(mailbox="INBOX", search="UNSEEN", max_messages=2, mark_seen=True))
        self.assertEqual(result["failed_messages"], 1)
        self.assertEqual(result["orders_submitted"], 1)
        submit.assert_awaited_once()
        mark_seen.assert_awaited_once_with("INBOX", ["good"])


@unittest.skipUnless(os.environ.get("MCK_TEST_DATABASE_URL"), "Requires isolated synthetic PostgreSQL")
class DurableReceiptTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        dsn = os.environ["MCK_TEST_DATABASE_URL"]
        self.schema = "mck_test_" + uuid.uuid4().hex
        self.admin = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
        await self.admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
        self.db = AsyncConnectionPool(dsn, min_size=1, max_size=6, open=False,
                                     kwargs={"options": "-c search_path=" + self.schema})
        await self.db.open(wait=True)
        async with self.db.connection() as conn:
            await conn.execute("""CREATE TABLE workflow_events (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL,
                order_id uuid, event_type text NOT NULL, payload jsonb NOT NULL,
                created_at timestamptz NOT NULL DEFAULT clock_timestamp())""")
            await conn.execute("CREATE TABLE orders (id uuid PRIMARY KEY,org_id uuid,status text,paid_amount numeric)")
            await conn.execute("INSERT INTO orders VALUES (%s,%s,'paid',10)", (ORDER, ORG))
        self.env = patch.dict(os.environ, {"MCK_ORG_ID": ORG,
            "MCK_PAID_NOTIFICATION_RECIPIENTS": "ben@strykefox.com,heather@strykefox.com"})
        self.env.start()
        self.app = SimpleNamespace(state=SimpleNamespace(db_pool=self.db))
        self.row = {"id": ORDER, "org_id": ORG, "first_name": "Synthetic", "last_name": "Patient",
                    "address_line1": "100 Synthetic Way", "city": "Las Vegas", "state": "NV", "zip_code": "89101"}

    async def asyncTearDown(self):
        self.env.stop()
        await self.db.close()
        await self.admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(self.schema)))
        await self.admin.close()

    async def events(self, prefix):
        async with self.db.connection() as conn:
            return await core._all(conn, "SELECT event_type,payload FROM workflow_events "
                "WHERE event_type LIKE $1 ORDER BY created_at,id", prefix + "%")

    async def welcome(self):
        return await core._send_welcome(self.db, None, intake(), org_id=ORG,
                                        record_id=RECORD, order_id=ORDER)

    async def test_welcome_oauth_failure_then_retry_sends_once(self):
        sender = SimpleNamespace(send_message=AsyncMock(side_effect=[BusinessMailError("Synthetic pre-send"), "mail-1"]))
        with patch.object(core.ZohoConfig, "from_env", return_value=MAIL_CONFIG), patch.object(core, "ZohoMailSender", return_value=sender):
            self.assertEqual((await self.welcome())["status"], "failed")
            self.assertEqual((await self.welcome())["status"], "confirmed")
            self.assertEqual((await self.welcome())["status"], "already_sent")
        self.assertEqual(sender.send_message.await_count, 2)
        self.assertEqual([r["event_type"] for r in await self.events("mck.welcome")], [
            "mck.welcome.dispatching", "mck.welcome.retryable", "mck.welcome.dispatching", "mck.welcome.sent"])

    async def test_uncertain_welcome_is_not_retried(self):
        sender = SimpleNamespace(send_message=AsyncMock(side_effect=ZohoMailSendUncertain("Synthetic timeout")))
        with patch.object(core.ZohoConfig, "from_env", return_value=MAIL_CONFIG), patch.object(core, "ZohoMailSender", return_value=sender):
            self.assertEqual((await self.welcome())["status"], "uncertain")
            self.assertEqual((await self.welcome())["status"], "uncertain")
        sender.send_message.assert_awaited_once()

    async def test_crash_after_dispatch_receipt_prevents_resend(self):
        async with self.db.connection() as conn:
            await core._event(conn, ORG, "mck.welcome.dispatching", {"source_reference": intake().source_reference}, ORDER)
        sender = SimpleNamespace(send_message=AsyncMock(return_value="should-not-send"))
        with patch.object(core, "ZohoMailSender", return_value=sender):
            self.assertEqual((await self.welcome())["status"], "uncertain")
        sender.send_message.assert_not_awaited()

    async def test_concurrent_welcome_uses_one_durable_send(self):
        async def delayed_send(**kwargs):
            await asyncio.sleep(.08)
            return "mail-1"
        sender = SimpleNamespace(send_message=AsyncMock(side_effect=delayed_send))
        with patch.object(core.ZohoConfig, "from_env", return_value=MAIL_CONFIG), patch.object(core, "ZohoMailSender", return_value=sender):
            results = await asyncio.gather(self.welcome(), self.welcome())
            self.assertIn("confirmed", [r["status"] for r in results])
            self.assertEqual((await self.welcome())["status"], "already_sent")
        sender.send_message.assert_awaited_once()

    async def test_paid_oauth_failure_then_retry_sends_once_to_exact_recipients(self):
        sender = SimpleNamespace(send_message=AsyncMock(side_effect=[BusinessMailError("Synthetic pre-send"), "paid-1"]))
        with patch.object(core.ZohoConfig, "from_env", return_value=MAIL_CONFIG), patch.object(core, "ZohoMailSender", return_value=sender):
            self.assertEqual(await core._send_paid(self.app, self.row), "failed")
            self.assertEqual(await core._send_paid(self.app, self.row), "sent")
            self.assertEqual(await core._send_paid(self.app, self.row), "already_handled")
        self.assertEqual(sender.send_message.await_count, 2)
        self.assertEqual(sender.send_message.call_args.kwargs["to_addresses"], ["ben@strykefox.com", "heather@strykefox.com"])
        content = sender.send_message.call_args.kwargs["content"]
        self.assertIn("Synthetic Patient", content)
        self.assertIn("100 Synthetic Way", content)
        self.assertNotIn("insurance", content.lower())

    async def test_unposted_or_reversed_payment_sends_nothing(self):
        async with self.db.connection() as conn:
            await conn.execute("UPDATE orders SET status='intake',paid_amount=0 WHERE id=%s", (ORDER,))
        sender = SimpleNamespace(send_message=AsyncMock())
        with patch.object(core, "ZohoMailSender", return_value=sender):
            self.assertEqual(await core._send_paid(self.app, self.row), "blocked")
        sender.send_message.assert_not_awaited()

    async def test_paid_notification_other_organization_is_blocked(self):
        self.row["org_id"] = str(uuid.uuid4())
        self.assertEqual(await core._send_paid(self.app, self.row), "blocked")

    async def test_manual_dispatch_respects_disabled_gate(self):
        with patch.dict(os.environ, {"MCK_PAID_NOTIFICATION_ENABLED": "false"}):
            result = await core.dispatch_paid_notifications(self.app)
        self.assertEqual(result["disabled"], 1)
        self.assertEqual(result["sent"], 0)

    async def project(self, payload=None):
        return await core._sheet_project(None, payload or intake(), RECORD,
            {"patient_id": ORDER, "order_id": ORDER}, "Synthetic outstanding", db=self.db, org_id=ORG)

    async def test_partial_sheet_failure_retries_only_incomplete_tab(self):
        calls = []
        async def upsert(**kwargs):
            calls.append((kwargs["worksheet_name"], kwargs["allow_create"]))
            if len(calls) == 2:
                raise ZohoSheetError("Synthetic lookup outage")
            return "created"
        fake = SimpleNamespace(upsert_record=AsyncMock(side_effect=upsert))
        with patch.object(core.ZohoSheetConfig, "from_env", return_value=SHEET_CONFIG), patch.object(core, "ZohoSheet", return_value=fake):
            with self.assertRaises(ZohoSheetError):
                await self.project()
            result = await self.project()
            self.assertEqual(result["patient_details"], "already_projected")
            self.assertEqual(result["heather_cover"], "created")
        self.assertEqual(calls, [("Patient Details", True), ("Heather Cover", True), ("Heather Cover", True)])

    async def test_ambiguous_append_and_index_lag_never_reappend(self):
        calls = []
        async def upsert(**kwargs):
            calls.append(kwargs["allow_create"])
            if len(calls) == 1:
                raise ZohoSheetWriteUncertain("Synthetic timeout after append")
            raise ZohoSheetError("Index not yet visible")
        fake = SimpleNamespace(upsert_record=AsyncMock(side_effect=upsert))
        with patch.object(core.ZohoSheetConfig, "from_env", return_value=SHEET_CONFIG), patch.object(core, "ZohoSheet", return_value=fake):
            for _ in range(3):
                with self.assertRaises(ZohoSheetError):
                    await self.project()
        self.assertEqual(calls, [True, False, False])

    async def test_concurrent_sheet_delivery_cannot_append_duplicate_rows(self):
        calls = []
        async def delayed_upsert(**kwargs):
            calls.append(kwargs["worksheet_name"])
            await asyncio.sleep(.08)
            return "created"
        fake = SimpleNamespace(upsert_record=AsyncMock(side_effect=delayed_upsert))
        with patch.object(core.ZohoSheetConfig, "from_env", return_value=SHEET_CONFIG), patch.object(core, "ZohoSheet", return_value=fake):
            results = await asyncio.gather(self.project(), self.project(), return_exceptions=True)
            self.assertTrue(any(isinstance(result, dict) for result in results))
            result = await self.project()
            self.assertEqual(result, {"patient_details": "already_projected", "heather_cover": "already_projected"})
        self.assertEqual(calls.count("Patient Details"), 1)
        self.assertEqual(calls.count("Heather Cover"), 1)

    async def test_changed_projection_updates_without_creating_again(self):
        calls = []
        async def upsert(**kwargs):
            calls.append(kwargs["allow_create"])
            return "created" if kwargs["allow_create"] else "updated"
        fake = SimpleNamespace(upsert_record=AsyncMock(side_effect=upsert))
        with patch.object(core.ZohoSheetConfig, "from_env", return_value=SHEET_CONFIG), patch.object(core, "ZohoSheet", return_value=fake):
            await self.project()
            await self.project(intake(due_date="2027-02-02"))
        self.assertEqual(calls, [True, True, False, False])


if __name__ == "__main__":
    unittest.main()
