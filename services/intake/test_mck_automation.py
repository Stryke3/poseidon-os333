from __future__ import annotations

import asyncio
import json
from pathlib import Path
import sys
import unittest
from urllib.parse import parse_qs

import httpx


SHARED = Path(__file__).resolve().parents[1] / "shared"
sys.path.insert(0, str(SHARED))

from mommy_care_workflow import (  # noqa: E402
    build_paid_notification,
    build_welcome_email,
    format_shipping_address,
    normalize_recipients,
    stable_record_id,
)
from zoho_mail_outbound import ZohoMailSender  # noqa: E402
from business_mail import ZohoConfig  # noqa: E402
from zoho_sheet import ZohoSheet, ZohoSheetConfig  # noqa: E402


class WorkflowHelperTests(unittest.TestCase):
    def test_record_id_is_deterministic_and_non_phi(self):
        first = stable_record_id("web3forms:abc-123")
        second = stable_record_id("web3forms:abc-123")
        self.assertEqual(first, second)
        self.assertRegex(first, r"^MCK-[A-F0-9]{10}$")
        self.assertNotIn("abc", first.lower())

    def test_paid_notification_contains_only_requested_operating_fields(self):
        subject, body = build_paid_notification(
            "Jane Doe",
            {
                "address_line1": "100 Main St",
                "address_line2": "Apt 2",
                "city": "Las Vegas",
                "state": "NV",
                "zip_code": "89101",
            },
        )
        self.assertEqual(subject, "Payment Posted — Jane Doe")
        self.assertIn("Patient: Jane Doe", body)
        self.assertIn("100 Main St", body)
        self.assertNotIn("$", body)
        self.assertNotIn("insurance", body.lower())

    def test_paid_notification_requires_complete_address(self):
        with self.assertRaises(ValueError):
            format_shipping_address(
                {"address_line1": "100 Main St", "city": "Las Vegas", "state": "NV"}
            )

    def test_internal_recipients_are_enforced(self):
        self.assertEqual(
            normalize_recipients(
                "ben@strykefox.com, Heather@strykefox.com",
                internal_only=True,
            ),
            ["ben@strykefox.com", "heather@strykefox.com"],
        )
        with self.assertRaises(ValueError):
            normalize_recipients("external@example.com", internal_only=True)

    def test_welcome_email_requests_missing_fields(self):
        subject, body = build_welcome_email(
            first_name="Maya",
            insurance_name="UnitedHealthcare",
            provider_summary=None,
            needs_dob=True,
            needs_provider=True,
        )
        self.assertIn("Welcome to Mommy Care Kit", subject)
        self.assertIn("front and back of your UnitedHealthcare insurance card", body)
        self.assertIn("Your date of birth", body)
        self.assertIn("OB/GYN", body)
        self.assertIn("4–6 weeks", body)
        self.assertIn("Heather", body)


class ZohoTransportTests(unittest.TestCase):
    def test_sheet_upsert_creates_when_record_is_absent(self):
        methods: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/oauth/v2/token"):
                return httpx.Response(200, json={"access_token": "token"})
            params = parse_qs(request.content.decode())
            method = params["method"][0]
            methods.append(method)
            if method == "worksheet.records.fetch":
                return httpx.Response(200, json={"status": "success", "records": []})
            if method == "worksheet.records.add":
                data = json.loads(params["json_data"][0])
                self.assertEqual(data[0]["Record ID"], "MCK-ABC")
                return httpx.Response(
                    200,
                    json={"status": "success", "method": method, "start_row": 5, "end_row": 5},
                )
            raise AssertionError(method)

        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                sheet = ZohoSheet(
                    client,
                    ZohoSheetConfig(
                        client_id="id", client_secret="secret",
                        refresh_token="refresh", resource_id="resource",
                    ),
                )
                return await sheet.upsert_record(
                    worksheet_name="Patient Details", record_id="MCK-ABC",
                    values={"Patient Name": "Jane Doe"},
                )

        result = asyncio.run(run())
        self.assertEqual(result, "created")
        self.assertEqual(methods, ["worksheet.records.fetch", "worksheet.records.add"])

    def test_sheet_upsert_updates_first_existing_record(self):
        methods: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/oauth/v2/token"):
                return httpx.Response(200, json={"access_token": "token"})
            params = parse_qs(request.content.decode())
            method = params["method"][0]
            methods.append(method)
            if method == "worksheet.records.fetch":
                return httpx.Response(
                    200,
                    json={"status": "success", "records": [{"Record ID": "MCK-ABC"}]},
                )
            if method == "worksheet.records.update":
                self.assertEqual(params["first_match_only"][0], "true")
                return httpx.Response(
                    200, json={"status": "success", "no_of_affected_rows": 1},
                )
            raise AssertionError(method)

        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                sheet = ZohoSheet(
                    client,
                    ZohoSheetConfig(
                        client_id="id", client_secret="secret",
                        refresh_token="refresh", resource_id="resource",
                    ),
                )
                return await sheet.upsert_record(
                    worksheet_name="Patient Details", record_id="MCK-ABC",
                    values={"Patient Name": "Jane Doe"},
                )

        self.assertEqual(asyncio.run(run()), "updated")
        self.assertEqual(methods, ["worksheet.records.fetch", "worksheet.records.update"])

    def test_mail_sender_verifies_account_and_returns_message_id(self):
        calls: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(f"{request.method} {request.url.path}")
            if request.url.path.endswith("/oauth/v2/token"):
                return httpx.Response(200, json={"access_token": "token"})
            if request.method == "GET" and request.url.path == "/api/accounts":
                return httpx.Response(
                    200,
                    json={
                        "status": {"code": 200},
                        "data": [{
                            "accountId": "123",
                            "primaryEmailAddress": "patients@strykefox.com",
                            "emailAddress": [],
                        }],
                    },
                )
            if request.method == "POST" and request.url.path == "/api/accounts/123/messages":
                payload = json.loads(request.content.decode())
                self.assertEqual(payload["fromAddress"], "patients@strykefox.com")
                self.assertEqual(payload["toAddress"], "patient@example.com")
                return httpx.Response(
                    200,
                    json={"status": {"code": 200}, "data": {"messageId": "987654"}},
                )
            raise AssertionError(str(request.url))

        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                sender = ZohoMailSender(
                    client,
                    ZohoConfig(
                        client_id="id", client_secret="secret", refresh_token="refresh",
                        account_id="123", email="patients@strykefox.com", folder_id="456",
                    ),
                )
                return await sender.send_message(
                    to_addresses=["patient@example.com"], subject="Welcome", content="Hello",
                )

        self.assertEqual(asyncio.run(run()), "987654")
        self.assertIn("GET /api/accounts", calls)
        self.assertIn("POST /api/accounts/123/messages", calls)


if __name__ == "__main__":
    unittest.main()
