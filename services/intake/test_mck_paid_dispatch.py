"""Exercise the enabled paid-order selection query against isolated PostgreSQL."""
from __future__ import annotations
import os
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
import uuid

import test_mck_safety_regressions as fixtures

ORG, ORDER, core = fixtures.ORG, fixtures.ORDER, fixtures.core


@unittest.skipUnless(os.environ.get("MCK_TEST_DATABASE_URL"), "Requires isolated synthetic PostgreSQL")
class PaidSelectionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await fixtures.DurableReceiptTests.asyncSetUp(self)
        self.patient_id = str(uuid.uuid4())
        async with self.db.connection() as conn:
            await conn.execute("""CREATE TABLE patients (
                id uuid PRIMARY KEY,org_id uuid,first_name text,last_name text,
                address_line1 text,address_line2 text,city text,state text,zip_code text,address jsonb)""")
            await conn.execute("""ALTER TABLE orders
                ADD patient_id uuid, ADD product_category text, ADD source text,
                ADD intake_payload jsonb DEFAULT '{}'::jsonb, ADD payment_date date,
                ADD paid_at timestamptz, ADD updated_at timestamptz DEFAULT now()""")
            await conn.execute("INSERT INTO patients VALUES (%s,%s,'Synthetic','Patient',"
                "'100 Synthetic Way',NULL,'Las Vegas','NV','89101','{}')", (self.patient_id, ORG))
            await conn.execute("UPDATE orders SET patient_id=%s,product_category='Mommy Care Kit',"
                "paid_at=now() WHERE id=%s", (self.patient_id, ORDER))
        self.enabled = patch.dict(os.environ, {"MCK_PAID_NOTIFICATION_ENABLED": "true"})
        self.enabled.start()

    async def asyncTearDown(self):
        self.enabled.stop()
        await fixtures.DurableReceiptTests.asyncTearDown(self)

    async def add_order(self, *, status="paid", paid_amount=20, category="Mommy Care Kit", org_id=ORG):
        order_id = str(uuid.uuid4())
        async with self.db.connection() as conn:
            await conn.execute("INSERT INTO orders (id,org_id,status,paid_amount,patient_id,"
                "product_category,paid_at) VALUES (%s,%s,%s,%s,%s,%s,now())",
                (order_id, org_id, status, paid_amount, self.patient_id, category))
        return order_id

    async def record(self, order_id, suffix):
        async with self.db.connection() as conn:
            await core._event(conn, ORG, "mck.payment_notification." + suffix, {}, order_id)

    async def selected(self, *, limit=25):
        send = AsyncMock(return_value="sent")
        with patch.object(core, "_send_paid", send):
            result = await core.dispatch_paid_notifications(self.app, limit=limit)
        return result, [str(call.args[1]["id"]) for call in send.await_args_list]

    async def test_only_positive_posted_mck_is_selected(self):
        await self.add_order(status="intake", paid_amount=20)
        await self.add_order(status="paid", paid_amount=0)
        await self.add_order(status="paid", paid_amount=-20)
        await self.add_order(category="Unrelated mobility")
        result, selected = await self.selected()
        self.assertEqual(selected, [ORDER])
        self.assertEqual(result["checked"], 1)
        self.assertEqual(result["sent"], 1)

    async def test_cross_organization_orders_and_patient_joins_are_excluded(self):
        await self.add_order(org_id=str(uuid.uuid4()))
        other_patient = str(uuid.uuid4())
        other_org = str(uuid.uuid4())
        mismatched_order = await self.add_order()
        async with self.db.connection() as conn:
            await conn.execute("INSERT INTO patients (id,org_id) VALUES (%s,%s)", (other_patient, other_org))
            await conn.execute("UPDATE orders SET patient_id=%s WHERE id=%s", (other_patient, mismatched_order))
        _, selected = await self.selected()
        self.assertEqual(selected, [ORDER])

    async def test_retryable_latest_attempt_remains_eligible(self):
        await self.record(ORDER, "dispatching")
        await self.record(ORDER, "retryable")
        for state in ("sent", "uncertain", "dispatching"):
            held = await self.add_order()
            await self.record(held, state)
        _, selected = await self.selected()
        self.assertEqual(selected, [ORDER])

    async def test_old_retryable_attempt_does_not_override_later_uncertain(self):
        await self.record(ORDER, "dispatching")
        await self.record(ORDER, "retryable")
        await self.record(ORDER, "dispatching")
        await self.record(ORDER, "uncertain")
        result, selected = await self.selected()
        self.assertEqual(selected, [])
        self.assertEqual(result["checked"], 0)

    async def test_blocked_oldest_order_does_not_starve_unattempted_order(self):
        await self.record(ORDER, "blocked")
        fresh = await self.add_order()
        result, selected = await self.selected(limit=1)
        self.assertEqual(selected, [fresh])
        self.assertEqual(result["checked"], 1)

    async def test_incomplete_address_blocks_paid_notification(self):
        sender = SimpleNamespace(send_message=AsyncMock())
        with patch.object(core, "ZohoMailSender", return_value=sender):
            incomplete = {**self.row, "zip_code": None}
            self.assertEqual(await core._send_paid(self.app, incomplete), "blocked")
        sender.send_message.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
