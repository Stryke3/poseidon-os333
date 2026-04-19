# =============================================================================
# services/core/intake_pipeline_audit.py
#
# Narrow helper module for the canonical patient intake pipeline in Core.
#
# Goals:
#   - One place for audit-log writes keyed by intake-stage semantics.
#   - One place for review-queue writes.
#   - Idempotency via source_fingerprint.
#   - No silent drops: every stage either produces an entity or a review item.
#
# This module is imported by services/core/main.py. It does NOT open
# connections on its own — callers pass an already-open psycopg connection
# inside their existing transaction scope.
# =============================================================================

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any, Iterable

logger = logging.getLogger("poseidon.core.intake_audit")


INTAKE_AUDIT_ACTIONS = {
    "received":        ("intake_received",        "intake"),
    "parsed":          ("intake_parsed",          "intake"),
    "parse_failed":    ("intake_parse_failed",    "intake"),
    "patient_created": ("create",                 "patients"),
    "patient_updated": ("update",                 "patients"),
    "order_created":   ("create",                 "orders"),
    "order_updated":   ("update",                 "orders"),
    "review_queued":   ("intake_review_queued",   "intake_review_queue"),
}


REVIEW_REASON_CODES = {
    "missing_fields",
    "low_ocr_confidence",
    "duplicate",
    "parse_failed",
    "payer_unknown",
    "hcpcs_unknown",
    "consent_missing",
}


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
    """
    Canonical fingerprint for idempotency. Stable across whitespace, case,
    and list ordering.

    Callers pass a dict of the identifying parts for the artifact being
    ingested. Example:

        compute_intake_fingerprint({
            "org_id": org_id,
            "payer_id": payer_id,
            "hcpcs_codes": ["L1833", "L1686"],
            "icd10_codes": ["M17.11"],
            "patient_email": "foo@bar.com",
            "dob": "1958-03-14",
        })
    """
    normalized = {k: _normalize_for_fingerprint(v) for k, v in sorted(parts.items())}
    blob = json.dumps(normalized, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


async def audit_intake(
    conn,
    *,
    audit_log_fn,
    org_id: str,
    user_id: str | None,
    stage: str,
    resource_id: str | None,
    ip_address: str | None = None,
) -> None:
    """
    Thin wrapper around services.core.main.audit_log that enforces a single
    vocabulary for intake-stage events.
    """
    try:
        action, resource = INTAKE_AUDIT_ACTIONS[stage]
    except KeyError as exc:
        raise ValueError(f"Unknown intake audit stage: {stage!r}") from exc
    await audit_log_fn(conn, org_id, user_id or "system", action, resource, resource_id, ip_address)


async def enqueue_review_item(
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
    Insert (or short-circuit on an existing fingerprint) a row into
    intake_review_queue. Returns the review_id or None if idempotently
    matched by fingerprint.

    Uses ON CONFLICT DO NOTHING on the unique (org_id, source,
    source_fingerprint) index so parallel workers cannot double-insert.
    """
    if reason_code not in REVIEW_REASON_CODES:
        logger.warning(
            "enqueue_review_item: unknown reason_code %r; accepting as free text", reason_code
        )

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
    """
    Decision function for a parsed artifact:
        returns (should_queue_for_review, reason_code, reason_detail)

    Rules:
      - confidence below threshold → queue
      - any required field missing → queue
      - otherwise → do not queue (proceed with create/update)
    """
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
