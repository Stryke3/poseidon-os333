# =============================================================================
# Shared intake review queue + fingerprint helpers (Core + Intake services).
# =============================================================================

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any, Iterable

logger = logging.getLogger("poseidon.intake_review_db")


def _normalize_for_fingerprint(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        return json.dumps(sorted(str(v).strip().lower() for v in value), separators=(",", ":"))
    if isinstance(value, dict):
        return json.dumps({k: _normalize_for_fingerprint(v) for k, v in sorted(value.items())}, separators=(",", ":"))
    if isinstance(value, str):
        return re.sub(r"\s+", " ", value).strip().lower()
    return str(value)


def compute_intake_fingerprint(parts: dict[str, Any]) -> str:
    normalized = {k: _normalize_for_fingerprint(v) for k, v in sorted(parts.items())}
    blob = json.dumps(normalized, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


async def enqueue_intake_review_item(
    conn,
    *,
    org_id: str,
    source: str,
    source_id: str | None,
    source_fingerprint: str | None,
    artifact_type: str,
    reason_code: str,
    reason_detail: str | None = None,
    parse_confidence: float | None = None,
    missing_fields: Iterable[str] | None = None,
    payload: dict[str, Any] | None = None,
    raw_document_url: str | None = None,
    patient_id: str | None = None,
    order_id: str | None = None,
    created_by: str | None = None,
) -> str | None:
    """
    Insert into intake_review_queue with ON CONFLICT DO NOTHING.
    Returns new review id, or None if conflict / no row returned.
    """
    missing_list = list(missing_fields) if missing_fields else []

    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO intake_review_queue (
                org_id, source, source_id, source_fingerprint,
                patient_id, order_id, artifact_type, status,
                reason_code, reason_detail, parse_confidence,
                missing_fields, payload, raw_document_url, created_by
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s,'pending',%s,%s,%s,%s,%s::jsonb,%s,%s)
            ON CONFLICT (org_id, source, source_fingerprint) DO NOTHING
            RETURNING id
            """,
            (
                org_id,
                source,
                source_id,
                source_fingerprint,
                patient_id,
                order_id,
                artifact_type,
                reason_code,
                reason_detail,
                parse_confidence,
                missing_list or None,
                json.dumps(payload) if payload is not None else None,
                raw_document_url,
                created_by,
            ),
        )
        row = await cur.fetchone()
        return str(row[0]) if row else None


def evaluate_parse_confidence(
    confidence: float | None,
    threshold: float,
    missing_required: Iterable[str],
) -> tuple[bool, str, str | None]:
    missing = [f for f in missing_required if f]
    if confidence is not None and confidence < threshold:
        return (
            True,
            "low_ocr_confidence",
            f"confidence={confidence:.3f} below threshold={threshold:.3f}",
        )
    if missing:
        return (
            True,
            "missing_fields",
            "required fields missing: " + ",".join(missing),
        )
    return (False, "", None)
