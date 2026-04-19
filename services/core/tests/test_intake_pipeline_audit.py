"""
Tests for services/core/intake_pipeline_audit.py

These are pure unit tests. They:
  - verify fingerprint stability (idempotency),
  - verify evaluate_parse_confidence decision table,
  - verify enqueue_review_item interacts with a fake connection correctly,
  - verify audit_intake rejects unknown stage names,
without requiring a live Postgres connection.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from services.core.intake_pipeline_audit import (
    INTAKE_AUDIT_ACTIONS,
    REVIEW_REASON_CODES,
    audit_intake,
    compute_intake_fingerprint,
    enqueue_review_item,
    evaluate_parse_confidence,
)


# ---------------------------------------------------------------------------
# compute_intake_fingerprint
# ---------------------------------------------------------------------------

def test_fingerprint_is_stable_across_whitespace_and_case():
    a = compute_intake_fingerprint(
        {"org_id": "ORG", "payer_id": "Medicare_DMERC", "dob": "1958-03-14"}
    )
    b = compute_intake_fingerprint(
        {"org_id": "org", "payer_id": " medicare_dmerc ", "dob": "1958-03-14"}
    )
    assert a == b


def test_fingerprint_is_stable_across_list_ordering():
    a = compute_intake_fingerprint(
        {"hcpcs_codes": ["L1833", "L1686"], "icd10_codes": ["M17.11", "J44.1"]}
    )
    b = compute_intake_fingerprint(
        {"hcpcs_codes": ["L1686", "L1833"], "icd10_codes": ["J44.1", "M17.11"]}
    )
    assert a == b


def test_fingerprint_diverges_on_material_change():
    a = compute_intake_fingerprint({"payer_id": "MEDICARE_DMERC", "hcpcs_codes": ["L1833"]})
    b = compute_intake_fingerprint({"payer_id": "MEDICARE_DMERC", "hcpcs_codes": ["L1686"]})
    assert a != b


def test_fingerprint_is_64_hex_chars():
    fp = compute_intake_fingerprint({"anything": "anything"})
    assert len(fp) == 64
    int(fp, 16)  # raises if not hex


# ---------------------------------------------------------------------------
# evaluate_parse_confidence
# ---------------------------------------------------------------------------

def test_low_confidence_triggers_review():
    queue, reason, detail = evaluate_parse_confidence(0.40, 0.55, [])
    assert queue is True
    assert reason == "low_ocr_confidence"
    assert "0.400" in (detail or "")


def test_missing_required_fields_triggers_review():
    queue, reason, detail = evaluate_parse_confidence(0.90, 0.55, ["payer_id", "dob"])
    assert queue is True
    assert reason == "missing_fields"
    assert "payer_id" in (detail or "") and "dob" in (detail or "")


def test_confident_and_complete_does_not_trigger_review():
    queue, reason, detail = evaluate_parse_confidence(0.95, 0.55, [])
    assert queue is False
    assert reason == ""
    assert detail is None


def test_none_confidence_and_no_missing_passes():
    queue, _, _ = evaluate_parse_confidence(None, 0.55, [])
    assert queue is False


# ---------------------------------------------------------------------------
# enqueue_review_item
# ---------------------------------------------------------------------------

def _make_fake_conn(returning: Any = ("uuid-1",)):
    cursor = MagicMock()

    async def _execute(*_args, **_kwargs):
        return None

    async def _fetchone():
        return returning

    cursor.execute = AsyncMock(side_effect=_execute)
    cursor.fetchone = AsyncMock(side_effect=_fetchone)

    cursor_ctx = MagicMock()
    cursor_ctx.__aenter__ = AsyncMock(return_value=cursor)
    cursor_ctx.__aexit__ = AsyncMock(return_value=False)

    conn = MagicMock()
    conn.cursor = MagicMock(return_value=cursor_ctx)
    return conn, cursor


def test_enqueue_review_item_returns_id_when_inserted():
    conn, cursor = _make_fake_conn(returning=("00000000-0000-0000-0000-000000000001",))
    rid = asyncio.run(
        enqueue_review_item(
            conn,
            org_id="org-1",
            source="fax",
            source_id="fax-123",
            source_fingerprint="abc",
            artifact_type="patient_intake",
            reason_code="low_ocr_confidence",
            parse_confidence=0.40,
            payload={"raw_text": "..."},
        )
    )
    assert rid == "00000000-0000-0000-0000-000000000001"
    cursor.execute.assert_awaited_once()
    sql = cursor.execute.call_args[0][0]
    assert "intake_review_queue" in sql
    assert "ON CONFLICT" in sql
    assert "RETURNING id" in sql


def test_enqueue_review_item_returns_none_when_conflict():
    conn, _ = _make_fake_conn(returning=None)
    rid = asyncio.run(
        enqueue_review_item(
            conn,
            org_id="org-1",
            source="email",
            source_id="msg-1",
            source_fingerprint="abc",
            artifact_type="patient_intake",
            reason_code="duplicate",
        )
    )
    assert rid is None


# ---------------------------------------------------------------------------
# audit_intake
# ---------------------------------------------------------------------------

def test_audit_intake_delegates_to_audit_log_fn():
    audit_log_fn = AsyncMock()
    conn = MagicMock()
    asyncio.run(
        audit_intake(
            conn,
            audit_log_fn=audit_log_fn,
            org_id="org-1",
            user_id="user-1",
            stage="patient_created",
            resource_id="patient-1",
            ip_address="1.2.3.4",
        )
    )
    action, resource = INTAKE_AUDIT_ACTIONS["patient_created"]
    audit_log_fn.assert_awaited_once_with(conn, "org-1", "user-1", action, resource, "patient-1", "1.2.3.4")


def test_audit_intake_rejects_unknown_stage():
    audit_log_fn = AsyncMock()
    conn = MagicMock()
    with pytest.raises(ValueError):
        asyncio.run(
            audit_intake(
                conn,
                audit_log_fn=audit_log_fn,
                org_id="org-1",
                user_id="user-1",
                stage="bogus_stage",
                resource_id=None,
            )
        )
    audit_log_fn.assert_not_awaited()


def test_review_reason_codes_set_is_non_empty():
    # Ensures REVIEW_REASON_CODES is still the canonical list; widening it
    # should require an explicit commit.
    assert {"missing_fields", "low_ocr_confidence", "duplicate", "parse_failed"}.issubset(
        REVIEW_REASON_CODES
    )
