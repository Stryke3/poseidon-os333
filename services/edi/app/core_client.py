"""
Verify orders.claim_strategy with Core before EDI claim submission.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx
from fastapi import HTTPException

log = logging.getLogger("edi.core_client")

CORE_API_URL = os.getenv("CORE_API_URL", os.getenv("POSEIDON_API_URL", "http://core:8001")).rstrip("/")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "").strip()


def _truthy_env(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes")


async def fetch_order_claim_authority(order_id: str, correlation_id: str | None) -> dict[str, Any]:
    if not INTERNAL_API_KEY:
        raise HTTPException(status_code=503, detail="INTERNAL_API_KEY is not configured for EDI")
    url = f"{CORE_API_URL}/internal/orders/{order_id}/claim-authority"
    headers = {"X-Internal-API-Key": INTERNAL_API_KEY}
    if correlation_id:
        headers["X-Correlation-ID"] = correlation_id
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, headers=headers)
    except Exception as exc:
        log.exception("Core claim-authority request failed: %s", exc)
        raise HTTPException(status_code=502, detail="Core service unreachable") from exc
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Order not found")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Core claim-authority failed: HTTP {r.status_code}")
    return r.json()


async def ensure_edi_claim_strategy(order_id: str, correlation_id: str | None) -> None:
    if _truthy_env("EDI_SKIP_CLAIM_AUTHORITY_CHECK"):
        log.warning(
            "EDI_SKIP_CLAIM_AUTHORITY_CHECK is set; skipping Core claim-authority (order_id=%s)",
            order_id,
        )
        return
    data = await fetch_order_claim_authority(order_id, correlation_id)
    strat = (data.get("claim_strategy") or "").strip().upper()
    if strat != "EDI":
        raise HTTPException(
            status_code=403,
            detail=f"Order claim_strategy must be EDI for EDI submission (current={data.get('claim_strategy')!r})",
        )
