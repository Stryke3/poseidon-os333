"""
POSEIDON EDI Service — Stedi API Client
Handles 837P submission via Stedi Healthcare API.
Stedi accepts JSON, handles X12 serialization, routes to clearinghouse.
Docs: https://www.stedi.com/docs/healthcare
"""
import os
import uuid
import logging
from typing import Optional

import httpx

log = logging.getLogger("edi.stedi")

STEDI_API_KEY = os.environ.get("STEDI_API_KEY", "")
STEDI_BASE_URL = "https://healthcare.us.stedi.com/2024-04-01"

# EDI Core — raw X12 read/write
STEDI_CORE_URL = "https://core.us.stedi.com/2023-08-01"


class StediClient:
    """
    Stedi Healthcare API client for professional claim submission,
    acknowledgment retrieval, and ERA report access.
    """

    def __init__(self):
        authorization = STEDI_API_KEY.strip()
        if authorization and not authorization.lower().startswith("bearer "):
            authorization = f"Bearer {authorization}"
        self.headers = {
            "Authorization": authorization,
            "Content-Type": "application/json",
        }

    async def submit_837p(self, payload: dict, idempotency_key: str | None = None) -> dict:
        """
        Submit structured 837P JSON to Stedi Healthcare API.
        POST /change/medicalnetwork/professionalclaims/v3/submission

        Returns synchronous response with:
          {status, controlNumber, claimReference: {correlationId, patientControlNumber, ...}, x12}
        """
        headers = {**self.headers}
        headers["Idempotency-Key"] = idempotency_key or uuid.uuid4().hex

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{STEDI_BASE_URL}/change/medicalnetwork/professionalclaims/v3/submission",
                json=payload,
                headers=headers,
            )
            if resp.status_code == 401:
                raise ValueError("Stedi API key invalid or expired")
            if resp.status_code >= 400:
                log.error(f"Stedi submission failed {resp.status_code}: {resp.text[:500]}")
                raise ValueError(f"Stedi API error {resp.status_code}: {resp.text[:500]}")
            return resp.json()

    async def submit_837p_raw_x12(self, raw_x12: str, idempotency_key: str | None = None) -> dict:
        """
        Submit raw X12 837P to Stedi Healthcare API.
        POST /change/medicalnetwork/professionalclaims/v3/raw-x12-submission
        """
        headers = {**self.headers}
        headers["Idempotency-Key"] = idempotency_key or uuid.uuid4().hex
        headers["Content-Type"] = "text/plain"

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{STEDI_BASE_URL}/change/medicalnetwork/professionalclaims/v3/raw-x12-submission",
                content=raw_x12,
                headers=headers,
            )
            if resp.status_code >= 400:
                raise ValueError(f"Stedi raw X12 error {resp.status_code}: {resp.text[:500]}")
            return resp.json()

    async def get_277_report(self, transaction_id: str) -> Optional[dict]:
        """
        Retrieve 277CA claim acknowledgment report.
        GET /change/medicalnetwork/reports/v2/{transactionId}/277
        """
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{STEDI_BASE_URL}/change/medicalnetwork/reports/v2/{transaction_id}/277",
                headers=self.headers,
            )
            if resp.status_code == 200:
                return resp.json()
            return None

    async def get_835_report(self, transaction_id: str) -> Optional[dict]:
        """
        Retrieve 835 ERA remittance report for a transaction.
        GET /change/medicalnetwork/reports/v2/{transactionId}/835
        """
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{STEDI_BASE_URL}/change/medicalnetwork/reports/v2/{transaction_id}/835",
                headers=self.headers,
            )
            if resp.status_code == 200:
                return resp.json()
            return None

    async def get_transaction(self, transaction_id: str) -> Optional[dict]:
        """
        Retrieve a single transaction by ID.
        GET /transactions/{transactionId}
        """
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{STEDI_BASE_URL}/transactions/{transaction_id}",
                headers=self.headers,
            )
            if resp.status_code == 200:
                return resp.json()
            return None

    async def poll_transactions(self, cursor: str | None = None) -> Optional[dict]:
        """
        Poll for new inbound transactions (277CA, 835 ERA).
        GET /polling/transactions
        """
        params = {}
        if cursor:
            params["cursor"] = cursor
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{STEDI_BASE_URL}/polling/transactions",
                headers=self.headers,
                params=params,
            )
            if resp.status_code == 200:
                return resp.json()
            return None

    async def check_claim_status(self, payload: dict) -> dict:
        """
        Real-time claim status check (276/277).
        POST /change/medicalnetwork/claimstatus/v2
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{STEDI_BASE_URL}/change/medicalnetwork/claimstatus/v2",
                json=payload,
                headers=self.headers,
            )
            if resp.status_code >= 400:
                raise ValueError(f"Stedi claim status error {resp.status_code}: {resp.text[:500]}")
            return resp.json()

    async def generate_x12(self, guide_id: str, payload: dict) -> dict:
        """
        Generate raw X12 string from JSON via Stedi Core API.
        Use when submitting via your own SFTP to clearinghouse.
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{STEDI_CORE_URL}/write",
                json={
                    "guideId": guide_id,
                    "input": payload,
                },
                headers=self.headers,
            )
            if resp.status_code >= 400:
                raise ValueError(f"Stedi Core write error {resp.status_code}: {resp.text[:500]}")
            return resp.json()

    async def parse_x12(self, guide_id: str, raw_x12: str) -> dict:
        """
        Parse raw X12 string into structured JSON via Stedi Core API.
        Use for inbound 835 remittance parsing.
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{STEDI_CORE_URL}/read",
                json={
                    "guideId": guide_id,
                    "input": raw_x12,
                    "inputFormat": "edi",
                },
                headers=self.headers,
            )
            if resp.status_code >= 400:
                raise ValueError(f"Stedi Core read error {resp.status_code}: {resp.text[:500]}")
            return resp.json()

    async def health_check(self) -> bool:
        """Verify Stedi connectivity."""
        if not STEDI_API_KEY:
            return False
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{STEDI_BASE_URL}/transactions?limit=1",
                    headers=self.headers,
                )
                return resp.status_code == 200
        except Exception:
            return False


stedi_client = StediClient()
