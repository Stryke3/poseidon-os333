from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List

import httpx

from shared.base import logger, settings


_token_lock = asyncio.Lock()
_cached_token: str | None = None
_token_expires_at: float = 0.0


class AvailityConfigError(RuntimeError):
    pass


async def _get_access_token() -> str:
    global _cached_token, _token_expires_at

    now = time.time()
    if _cached_token and now < _token_expires_at - 30:
        return _cached_token

    async with _token_lock:
        now = time.time()
        if _cached_token and now < _token_expires_at - 30:
            return _cached_token

        if not settings.availity_token_url or not settings.availity_client_id or not settings.availity_client_secret:
            raise AvailityConfigError("Availity OAuth settings are not configured")

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                settings.availity_token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": settings.availity_client_id,
                    "client_secret": settings.availity_client_secret,
                },
                headers={"Accept": "application/json"},
            )

        if resp.status_code >= 400:
            logger.error("Availity token request failed: %s %s", resp.status_code, resp.text[:500])
            raise RuntimeError(f"Availity token request failed with {resp.status_code}")

        data = resp.json()
        access_token = data.get("access_token")
        expires_in = int(data.get("expires_in", 300))
        if not access_token:
            logger.error("Availity token response missing access_token: %s", data)
            raise RuntimeError("Availity token response missing access_token")

        _cached_token = access_token
        _token_expires_at = time.time() + max(expires_in, 60)
        logger.info("Availity access token acquired (expires_in=%s)", expires_in)
        return access_token


async def submit_eligibility_270(edi_270: str, correlation_id: str | None = None) -> Dict[str, Any]:
    """
    Submit a raw X12 270 eligibility inquiry to Availity.
    Returns status code and raw body so downstream parsers can handle 271.
    """
    if not settings.availity_eligibility_url:
        raise AvailityConfigError("AVAILITY_ELIGIBILITY_URL is not configured")

    token = await _get_access_token()

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/EDI-X12",
        "Accept": "application/EDI-X12, application/json",
    }
    if correlation_id:
        headers["X-Correlation-ID"] = correlation_id

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            settings.availity_eligibility_url,
            content=edi_270.encode("utf-8"),
            headers=headers,
        )

    logger.info(
        "Availity eligibility 270 submitted status=%s correlation_id=%s",
        resp.status_code,
        correlation_id,
    )

    return {
        "status_code": resp.status_code,
        "headers": dict(resp.headers),
        "body": resp.text,
    }


def parse_271_basic(x12_271: str) -> Dict[str, Any]:
    """
    Very lightweight 271 parser to extract high-signal fields for the UI.
    This is NOT a full X12 implementation – just enough for "eligible / not eligible"
    plus some coverage and error detail.
    """
    segments = [s.strip() for s in x12_271.replace("\n", "").split("~") if s.strip()]
    coverage: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    for seg in segments:
        parts = seg.split("*")
        if not parts:
            continue
        tag = parts[0]

        if tag == "EB":
            # EB*eligibility_indicator*coverage_level*service_type*...
            record: Dict[str, Any] = {}
            if len(parts) > 1:
                record["eligibility_indicator"] = parts[1]
            if len(parts) > 2:
                record["coverage_level"] = parts[2]
            if len(parts) > 3:
                record["service_type"] = parts[3]
            if len(parts) > 4:
                record["insurance_type"] = parts[4]
            if len(parts) > 7:
                record["description"] = parts[7]
            coverage.append(record)

        elif tag == "AAA":
            # AAA*segment_id*reject_reason_code*follow_up_action_code*...
            err: Dict[str, Any] = {}
            if len(parts) > 1:
                err["segment_id"] = parts[1]
            if len(parts) > 2:
                err["reject_reason_code"] = parts[2]
            if len(parts) > 3:
                err["follow_up_action_code"] = parts[3]
            errors.append(err)

    eligible = bool(coverage) and not errors

    return {
        "eligible": eligible,
        "coverage_segments": coverage,
        "errors": errors,
    }


# ---------------------------------------------------------------------------
# Billing: 837 claim submission
# ---------------------------------------------------------------------------

async def submit_claim_837(
    edi_837: str,
    claim_type: str = "professional",
    correlation_id: str | None = None,
) -> Dict[str, Any]:
    """
    Submit a raw X12 837 (P, I, or D) to Availity.
    claim_type: professional | institutional | dental
    Returns status code and raw body (often 997 acknowledgment or error).
    """
    if not settings.availity_claims_url:
        raise AvailityConfigError("AVAILITY_CLAIMS_URL is not configured")

    token = await _get_access_token()

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/EDI-X12",
        "Accept": "application/EDI-X12, application/json",
    }
    if correlation_id:
        headers["X-Correlation-ID"] = correlation_id

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            settings.availity_claims_url,
            content=edi_837.encode("utf-8"),
            headers=headers,
        )

    logger.info(
        "Availity claim 837 submitted status=%s claim_type=%s correlation_id=%s",
        resp.status_code,
        claim_type,
        correlation_id,
    )

    return {
        "status_code": resp.status_code,
        "headers": dict(resp.headers),
        "body": resp.text,
    }


def parse_997_basic(x12_997: str) -> Dict[str, Any]:
    """
    Lightweight 997 functional acknowledgment parser.
    Extracts AK1/AK9 and key AK2/AK5 per transaction for accepted/rejected.
    """
    segments = [s.strip() for s in x12_997.replace("\n", "").split("~") if s.strip()]
    transactions: List[Dict[str, Any]] = []
    ak1 = {}
    ak9 = {}

    for seg in segments:
        parts = seg.split("*")
        if not parts:
            continue
        tag = parts[0]

        if tag == "AK1":
            ak1 = {"functional_id": parts[1] if len(parts) > 1 else "", "control_num": parts[2] if len(parts) > 2 else ""}
        elif tag == "AK9":
            ak9 = {
                "accepted": (parts[1] if len(parts) > 1 else "").upper() == "A",
                "trans_set_count": int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0,
                "received_count": int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0,
            }
        elif tag == "AK5":
            transactions.append({
                "trans_set_id": parts[1] if len(parts) > 1 else "",
                "ack_code": parts[2] if len(parts) > 2 else "",
                "accepted": (parts[2] if len(parts) > 2 else "").upper() == "A",
            })

    return {
        "functional_id": ak1.get("functional_id"),
        "control_num": ak1.get("control_num"),
        "accepted": ak9.get("accepted", False),
        "trans_set_count": ak9.get("trans_set_count", 0),
        "received_count": ak9.get("received_count", 0),
        "transactions": transactions,
    }


def parse_835_basic(x12_835: str) -> Dict[str, Any]:
    """
    Lightweight 835 (ERA) parser: CLP segments for claim payment info.
    """
    segments = [s.strip() for s in x12_835.replace("\n", "").split("~") if s.strip()]
    claims: List[Dict[str, Any]] = []

    for seg in segments:
        parts = seg.split("*")
        if not parts:
            continue
        if parts[0] == "CLP":
            # CLP*claim_id*claim_status*billed*paid*responsibility*claim_filing*ref*facility*...
            claims.append({
                "claim_id": parts[1] if len(parts) > 1 else "",
                "claim_status": parts[2] if len(parts) > 2 else "",
                "billed_amount": float(parts[3]) if len(parts) > 3 and parts[3] else 0,
                "paid_amount": float(parts[4]) if len(parts) > 4 and parts[4] else 0,
                "patient_responsibility": float(parts[5]) if len(parts) > 5 and parts[5] else 0,
            })

    return {
        "claims": claims,
        "claim_count": len(claims),
    }

