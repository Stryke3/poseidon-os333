"""Direct tests for services/shared/intake_review_db.py (no FastAPI)."""

from __future__ import annotations

import sys
from pathlib import Path

_SHARED = Path(__file__).resolve().parents[2] / "shared"
sys.path.insert(0, str(_SHARED))

from intake_review_db import compute_intake_fingerprint, evaluate_parse_confidence  # noqa: E402


def test_fingerprint_stable_for_intake_idempotency():
    a = compute_intake_fingerprint({"org_id": "u1", "idempotency_key": "k1", "payload_hash": "h1"})
    b = compute_intake_fingerprint({"org_id": "u1", "idempotency_key": "k1", "payload_hash": "h1"})
    assert a == b
    assert len(a) == 64


def test_evaluate_ocr_low_triggers_review():
    q, reason, _ = evaluate_parse_confidence(0.2, 0.55, [])
    assert q is True
    assert reason == "low_ocr_confidence"
