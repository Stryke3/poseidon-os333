# =============================================================================
# services/core/intake_pipeline_audit.py
#
# Narrow helper module for the canonical patient intake pipeline in Core.
#
# Shared SQL + fingerprint logic lives in services/shared/intake_review_db.py
# so the Intake microservice can enqueue review rows with identical semantics.
# =============================================================================

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any

_shared_dir = Path(__file__).resolve().parent.parent / "shared"
if str(_shared_dir) not in sys.path:
    sys.path.insert(0, str(_shared_dir))

from intake_review_db import (  # noqa: E402
    compute_intake_fingerprint,
    enqueue_intake_review_item,
    evaluate_parse_confidence,
)

logger = logging.getLogger("poseidon.core.intake_audit")


INTAKE_AUDIT_ACTIONS = {
    "received": ("intake_received", "intake"),
    "parsed": ("intake_parsed", "intake"),
    "parse_failed": ("intake_parse_failed", "intake"),
    "patient_created": ("create", "patients"),
    "patient_updated": ("update", "patients"),
    "order_created": ("create", "orders"),
    "order_updated": ("update", "orders"),
    "review_queued": ("intake_review_queued", "intake_review_queue"),
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
    missing_fields=None,
    payload: dict[str, Any] | None = None,
    raw_document_url: str | None = None,
    patient_id: str | None = None,
    order_id: str | None = None,
    created_by: str | None = None,
) -> str | None:
    if reason_code not in REVIEW_REASON_CODES:
        logger.warning(
            "enqueue_review_item: unknown reason_code %r; accepting as free text", reason_code
        )
    return await enqueue_intake_review_item(
        conn,
        org_id=org_id,
        source=source,
        source_id=source_id,
        source_fingerprint=source_fingerprint,
        artifact_type=artifact_type,
        reason_code=reason_code,
        reason_detail=reason_detail,
        parse_confidence=parse_confidence,
        missing_fields=missing_fields,
        payload=payload,
        raw_document_url=raw_document_url,
        patient_id=patient_id,
        order_id=order_id,
        created_by=created_by,
    )
