"""
Smoke tests for 837P claim path (no live DB or clearinghouse).

Run from services/edi (Python 3.9+ after deferred annotations in app code):

  PYTHONPATH=. python -m pytest tests/ -v

Docker (matches production image):

  docker run --rm -v "$PWD:/app" -w /app python:3.11-slim-bookworm bash -c \\
    "pip install -q -r requirements.txt -r requirements-dev.txt && PYTHONPATH=. pytest tests/ -v"
"""
import asyncio
import os
import uuid
from datetime import date
from unittest.mock import AsyncMock

# claims_837p imports app.database, which reads DATABASE_URL at import time
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@127.0.0.1:15432/edi_test")

from app.builders.x12_837p import generate_837p
from app.routers.claims_837p import _validate_order_for_submission


def test_generate_837p_produces_x12_envelope_and_claim():
    oid = uuid.uuid4()
    order = {
        "id": oid,
        "first_name": "Jane",
        "last_name": "Doe",
        "dos_start": date(2025, 1, 15),
        "hcpcs_code": "A5500",
        "total_billed": 100.0,
        "address1": "123 Main St",
        "city": "Las Vegas",
        "state": "NV",
        "zip": "89117",
        "payer_name": "Test Payer",
        "payer_code": "TESTPAYER",
    }
    diags = [{"icd10_code": "M25.561", "sequence": 1}]
    x12 = generate_837p(order, diags, [], "000000001")
    assert x12.startswith("ISA*"), "should start with ISA segment"
    assert "~ST*837*" in x12 or "*ST*837*" in x12
    assert "CLM*" in x12
    assert "~SE*" in x12 or "*SE*" in x12
    assert x12.rstrip().endswith("~")


def test_validate_order_not_found():
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=None)
    oid = str(uuid.uuid4())
    errors = asyncio.run(_validate_order_for_submission(oid, conn))
    assert len(errors) == 1
    assert "not found" in errors[0].lower()
