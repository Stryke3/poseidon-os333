"""
POSEIDON EDI Service — Stedi API Client
Handles 837P submission via Stedi's generate-edi endpoint.
Stedi accepts JSON, handles X12 serialization, routes to clearinghouse.
Docs: https://www.stedi.com/docs/edi-platform
"""
import os
import logging
from typing import Optional

import httpx

log = logging.getLogger("edi.stedi")

STEDI_API_KEY    = os.environ.get("STEDI_API_KEY", "")
STEDI_BASE_URL   = "https://healthcare.us.stedi.com/2024-04-01"

# Fallback: raw X12 generation endpoint
STEDI_EDI_URL    = "https://edi-core.stedi.com/2021-06-05"


class StediClient:
    """
    Two submission modes:
    1. Healthcare API (preferred) — POST JSON, Stedi routes to payer
    2. EDI Core + SFTP — generate raw X12, we push via SFTP to clearinghouse
    """

    def __init__(self):
        self.headers = {
            "Authorization": f"Key {STEDI_API_KEY}",
            "Content-Type": "application/json",
        }

    async def submit_837p(self, payload: dict) -> dict:
        """
        Submit structured 837P JSON to Stedi Healthcare API.
        Returns: {transactionId, interchangeControlNumber, acknowledgmentStatus, rawX12}
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{STEDI_BASE_URL}/change-healthcare/claims/v1/submission",
                json=payload,
                headers=self.headers,
            )
            if resp.status_code == 401:
                raise ValueError("Stedi API key invalid or expired")
            if resp.status_code >= 400:
                log.error(f"Stedi submission failed {resp.status_code}: {resp.text[:500]}")
                raise ValueError(f"Stedi API error {resp.status_code}: {resp.text[:500]}")
            return resp.json()

    async def generate_x12(self, guide_id: str, payload: dict) -> dict:
        """
        Generate raw X12 string from JSON via Stedi EDI Core.
        Use when submitting via your own SFTP to clearinghouse.
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{STEDI_EDI_URL}/write",
                json={
                    "guideId": guide_id,
                    "input": payload,
                },
                headers=self.headers,
            )
            if resp.status_code >= 400:
                raise ValueError(f"Stedi EDI Core error {resp.status_code}: {resp.text[:500]}")
            return resp.json()

    async def parse_x12(self, guide_id: str, raw_x12: str) -> dict:
        """
        Parse raw X12 835 string into structured JSON via Stedi EDI Core.
        Use for inbound 835 remittance parsing.
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{STEDI_EDI_URL}/read",
                json={
                    "guideId": guide_id,
                    "input": raw_x12,
                    "inputFormat": "edi",
                },
                headers=self.headers,
            )
            if resp.status_code >= 400:
                raise ValueError(f"Stedi 835 parse error {resp.status_code}: {resp.text[:500]}")
            return resp.json()

    async def get_acknowledgment(self, transaction_id: str) -> Optional[dict]:
        """Poll for 999/277 functional acknowledgment."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{STEDI_BASE_URL}/transactions/{transaction_id}",
                headers=self.headers,
            )
            if resp.status_code == 200:
                return resp.json()
            return None

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
