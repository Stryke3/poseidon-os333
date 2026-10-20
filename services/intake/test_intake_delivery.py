"""Synthetic orchestration tests; no database, mailbox, or delivery is contacted."""
from __future__ import annotations
import ast
import asyncio
from contextlib import asynccontextmanager
import json
from pathlib import Path
import re
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

ROOT = Path(__file__).resolve().parents[1]

def functions(path, names, scope):
    tree = ast.parse(path.read_text())
    nodes = [ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)]
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names:
            node.decorator_list = []
            nodes.append(node)
    exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])), str(path), "exec"), scope)
    return scope

class HTTPException(Exception):
    def __init__(self, detail):
        self.detail = detail
        super().__init__(detail)

class IntakeDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def poll(self, *, orders=None, receipt=None, advance_error=None, attachments=True, mark_seen=True):
        message = {"imap_id": "999", "message_id": "<synthetic@example.test>",
                   "subject": "Synthetic intake", "from": "forms@example.test",
                   "attachments": [("synthetic.csv", b"synthetic")] if attachments else [],
                   "attachment_archives": [{"path": "/verified/synthetic.csv"}] if attachments else []}
        self.scope = functions(ROOT / "intake/main.py", {"poll_email_intake"}, {
            "json": json, "HTTPException": HTTPException,
            "_fetch_email_messages": AsyncMock(return_value=[message]),
            "_archive_email_messages": AsyncMock(), "_parse_attachment": lambda *args: orders or [],
            "_submit_orders_to_core": AsyncMock(return_value=receipt),
            "_advance_core_order_workflow": AsyncMock(return_value={"status": "advanced"}, side_effect=advance_error),
            "cache_rpush": AsyncMock(), "_mark_email_messages_seen": AsyncMock()})
        self.request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
        self.options = SimpleNamespace(mailbox="INBOX", search="UNSEEN", max_messages=10, mark_seen=mark_seen)
        return await self.scope["poll_email_intake"](self.request, self.options)

    def assert_unread(self):
        self.scope["_mark_email_messages_seen"].assert_awaited_once_with("INBOX", [])

    async def test_body_only_form_stays_unread_for_review(self):
        result = await self.poll(attachments=False)
        self.assertEqual(result["status"], "needs_review")
        self.assertEqual(result["review_messages"], 1)
        self.assert_unread()
        self.scope["_submit_orders_to_core"].assert_not_awaited()

    async def test_unrecognized_attachment_is_not_claimed_as_processed(self):
        result = await self.poll(orders=[])
        self.assertEqual(result["messages"][0]["status"], "needs_review")
        self.assert_unread()

    async def test_partial_core_import_preserves_receipt_and_stays_unread(self):
        receipt = {"results": [{"index": 0, "status": "created", "order_id": "order-1"},
                               {"index": 1, "status": "ambiguous_patient"}]}
        result = await self.poll(orders=[{}, {}], receipt=receipt)
        self.assertEqual(result["orders_submitted"], 1)
        self.assertEqual(result["messages"][0]["import_result"], receipt)
        self.assertEqual(result["status"], "needs_review")
        self.assert_unread()

    async def test_incomplete_success_response_stays_unread(self):
        result = await self.poll(orders=[{}], receipt={"results": []})
        self.assertEqual(result["status"], "needs_review")
        self.assert_unread()

    async def test_duplicate_row_indexes_do_not_confirm_every_row(self):
        result = await self.poll(orders=[{}, {}], receipt={"results": [
            {"index": 0, "status": "created", "order_id": "order-1"},
            {"index": 0, "status": "created", "order_id": "order-2"}]})
        self.assertEqual(result["status"], "needs_review")
        self.assert_unread()

    async def test_existing_duplicate_does_not_resend_workflow_automatically(self):
        result = await self.poll(orders=[{}], receipt={"results": [
            {"index": 0, "status": "skipped_duplicate", "duplicate_of_order_id": "order-1"}]})
        self.assertEqual(result["status"], "needs_review")
        self.scope["_advance_core_order_workflow"].assert_not_awaited()
        self.assert_unread()

    async def test_workflow_failure_preserves_saved_order_and_stays_unread(self):
        receipt = {"results": [{"index": 0, "status": "created", "order_id": "order-1"}]}
        result = await self.poll(orders=[{}], receipt=receipt, advance_error=HTTPException("unavailable"))
        self.assertEqual(result["status"], "needs_review")
        self.assertEqual(result["messages"][0]["import_result"], receipt)
        self.assertEqual(result["messages"][0]["workflow_results"][0]["status"], "workflow_error")
        self.assert_unread()

    async def test_success_marks_only_confirmed_message_read(self):
        result = await self.poll(orders=[{}], receipt={"results": [
            {"index": 0, "status": "created", "order_id": "order-1"}]})
        self.assertEqual(result["status"], "processed")
        self.scope["_mark_email_messages_seen"].assert_awaited_once_with("INBOX", ["999"])

    async def test_mark_seen_false_is_respected(self):
        await self.poll(attachments=False, mark_seen=False)
        self.scope["_mark_email_messages_seen"].assert_not_awaited()

    async def test_bad_archive_does_not_block_next_message(self):
        receipt = {"results": [{"index": 0, "status": "created", "order_id": "order-1"}]}
        await self.poll(orders=[{}], receipt=receipt)
        original = self.scope["_fetch_email_messages"].return_value[0]
        self.scope["_fetch_email_messages"].return_value = [dict(original, imap_id="bad"), dict(original, imap_id="good")]
        self.scope["_submit_orders_to_core"].reset_mock()
        self.scope["_mark_email_messages_seen"].reset_mock()
        async def archive(messages):
            self.assertEqual(len(messages), 1)
            if messages[0]["imap_id"] == "bad":
                raise RuntimeError("Synthetic archive failure")
        self.scope["_archive_email_messages"] = archive
        result = await self.scope["poll_email_intake"](self.request, self.options)
        self.assertEqual(result["failed_messages"], 1)
        self.assertEqual(result["orders_submitted"], 1)
        self.scope["_submit_orders_to_core"].assert_awaited_once()
        self.scope["_mark_email_messages_seen"].assert_awaited_once_with("INBOX", ["good"])

class SendUncertain(RuntimeError):
    pass

class WelcomeDeliveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.events = set()
        self.locked = False
        self.committed = False
        self.payload = SimpleNamespace(email="synthetic@example.test", source_reference="test:1", first_name="Test",
            insurance_plan=None, provider_name=None, date_of_birth="1990-01-01", member_id=None,
            address_line1=None, city=None, state=None, zip_code=None)
        self.conn = SimpleNamespace(commit=AsyncMock(side_effect=self.commit), rollback=AsyncMock())
        self.db = SimpleNamespace(connection=self.connection)
        self.sender = SimpleNamespace(send_message=AsyncMock(side_effect=self.send))
        self.scope = functions(ROOT / "core/conveyor_api.py", {"_send_welcome", "_dispatch_mck_mail"}, {
            "_one": self.one, "_order_event": self.exists, "_event": self.event,
            "ZohoMailSender": lambda *args: self.sender,
            "ZohoConfig": SimpleNamespace(from_env=lambda: None),
            "build_welcome_email": lambda **kwargs: ("Welcome", "Synthetic"),
            "ZohoMailSendUncertain": SendUncertain})

    async def commit(self):
        self.committed = True

    @asynccontextmanager
    async def connection(self):
        yield self.conn

    async def one(self, conn, query, key):
        if "pg_try_advisory_lock" in query:
            if self.locked:
                return {"locked": False}
            self.locked = True
            return {"locked": True}
        if "pg_advisory_unlock" in query:
            self.locked = False
            return {"unlocked": True}
        raise AssertionError(query)

    async def exists(self, conn, order_id, event_types):
        return any(event_type in self.events for event_type in event_types)

    async def event(self, conn, org, event_type, payload, order_id):
        self.events.add(event_type)

    async def send(self, **kwargs):
        await kwargs["before_send"]()
        self.assertIn("mck.welcome.dispatching", self.events)
        self.assertTrue(self.committed)
        return "zoho-message-1"

    async def run_welcome(self, order_id="order-1"):
        return await self.scope["_send_welcome"](self.db, None, self.payload,
            org_id="org-1", record_id="MCK-TEST", order_id=order_id)

    async def test_no_patient_email_before_confirmed_spear_record(self):
        self.assertEqual((await self.run_welcome(None))["status"], "blocked")
        self.sender.send_message.assert_not_awaited()

    async def test_success_and_replay_send_once(self):
        self.assertEqual((await self.run_welcome())["status"], "confirmed")
        self.assertEqual((await self.run_welcome())["status"], "already_sent")
        self.sender.send_message.assert_awaited_once()
        self.assertFalse(self.locked)

    async def test_timeout_after_dispatch_does_not_send_twice(self):
        async def timeout(**kwargs):
            await kwargs["before_send"]()
            raise SendUncertain("Synthetic post timeout")
        self.sender.send_message.side_effect = timeout
        self.assertEqual((await self.run_welcome())["status"], "uncertain")
        self.assertEqual((await self.run_welcome())["status"], "uncertain")
        self.sender.send_message.assert_awaited_once()
        self.assertFalse(self.locked)

    async def test_oauth_failure_is_retryable_and_then_delivers_once(self):
        self.sender.send_message.side_effect = RuntimeError("Synthetic pre-send OAuth failure")
        result = await self.run_welcome()
        self.assertEqual(result["status"], "failed")
        self.assertTrue(result["retryable"])
        self.assertNotIn("mck.welcome.dispatching", self.events)
        self.assertNotIn("mck.welcome.uncertain", self.events)
        self.sender.send_message.side_effect = self.send
        self.assertEqual((await self.run_welcome())["status"], "confirmed")
        self.assertEqual((await self.run_welcome())["status"], "already_sent")
        self.assertEqual(self.sender.send_message.await_count, 2)

    async def test_crash_after_reservation_requires_reconciliation(self):
        self.events.add("mck.welcome.dispatching")
        self.assertEqual((await self.run_welcome())["status"], "uncertain")
        self.sender.send_message.assert_not_awaited()

    async def test_previous_uncertain_send_is_not_retried(self):
        self.events.add("mck.welcome.uncertain")
        self.assertEqual((await self.run_welcome())["status"], "uncertain")
        self.sender.send_message.assert_not_awaited()

    async def test_concurrent_attempt_does_not_send_twice(self):
        started, release = asyncio.Event(), asyncio.Event()
        async def delayed_send(**kwargs):
            started.set()
            await release.wait()
            return await self.send(**kwargs)
        self.sender.send_message.side_effect = delayed_send
        first = asyncio.create_task(self.run_welcome())
        await started.wait()
        try:
            self.assertEqual((await self.run_welcome())["status"], "in_progress")
        finally:
            release.set()
        self.assertEqual((await first)["status"], "confirmed")
        self.sender.send_message.assert_awaited_once()

    async def test_provider_reply_without_message_id_requires_reconciliation(self):
        async def no_id(**kwargs):
            await kwargs["before_send"]()
            return None
        self.sender.send_message.side_effect = no_id
        self.assertEqual((await self.run_welcome())["status"], "uncertain")
        self.assertNotIn("mck.welcome.sent", self.events)

class SqlBindingTests(unittest.TestCase):
    def test_repeated_dob_and_literal_percent_are_bound_correctly(self):
        scope = functions(ROOT / "core/conveyor_api.py", {"_bind"}, {"re": re})
        query, params = scope["_bind"]("SELECT $1, $2, $2 WHERE name LIKE '%mommy%'", ("org-1", "1990-01-01"))
        self.assertEqual(query, "SELECT %s, %s, %s WHERE name LIKE '%%mommy%%'")
        self.assertEqual(params, ("org-1", "1990-01-01", "1990-01-01"))

if __name__ == "__main__":
    unittest.main()
