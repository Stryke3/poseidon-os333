# =============================================================================
# Denial CSV / XLSX → payment_outcomes (Trident training source)
# =============================================================================
from __future__ import annotations

import csv
import io
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

logger = logging.getLogger("poseidon.denial_csv_ingest")


def norm_key(k: str | None) -> str:
    if k is None:
        return ""
    return re.sub(r"[^a-z0-9]+", "_", str(k).strip().lower()).strip("_")


def parse_csv_bytes(content: bytes) -> list[dict[str, Any]]:
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def parse_xlsx_bytes(content: bytes) -> list[dict[str, Any]]:
    import openpyxl  # type: ignore

    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active
    values = list(ws.iter_rows(values_only=True))
    if not values:
        return []
    headers = [norm_key(str(v or "")) for v in values[0]]
    rows: list[dict[str, Any]] = []
    for record in values[1:]:
        row = {}
        for i, h in enumerate(headers):
            if not h:
                continue
            row[h] = record[i] if i < len(record) else None
        if any(v not in (None, "") for v in row.values()):
            rows.append(row)
    return rows


def _row_to_norm_map(row: dict[str, Any]) -> dict[str, Any]:
    return {norm_key(str(k)): v for k, v in row.items() if k is not None}


def _pick(nk: dict[str, Any], *aliases: str) -> Any:
    for a in aliases:
        if a in nk and nk[a] not in (None, ""):
            return nk[a]
    return None


def _opt_uuid(val: Any) -> str | None:
    if val is None or val == "":
        return None
    try:
        return str(uuid.UUID(str(val).strip()))
    except (ValueError, AttributeError):
        return None


def _opt_date(val: Any) -> date | None:
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y%m%d", "%d-%b-%Y"):
        try:
            return datetime.strptime(s[:20], fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _opt_float(val: Any) -> float | None:
    if val is None or val == "":
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace(",", "")
    if not s:
        return None
    try:
        return float(Decimal(s))
    except (InvalidOperation, ValueError):
        return None


def _opt_str(val: Any) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s or None


def _infer_is_denial(nk: dict[str, Any], default: bool = True) -> bool:
    raw = _pick(nk, "is_denial", "was_denied", "denial", "denied", "is_denied")
    if raw is None:
        return default
    if isinstance(raw, bool):
        return raw
    s = str(raw).strip().lower()
    if s in ("1", "true", "yes", "y", "denied", "denial"):
        return True
    if s in ("0", "false", "no", "n", "paid", "approved"):
        return False
    return default


@dataclass
class PreparedOutcome:
    values: tuple[Any, ...]


def prepare_payment_outcome_row(
    raw: dict[str, Any],
    *,
    org_id: str | None,
    eob_reference: str,
    default_is_denial: bool = True,
    record_source: str = "denial_csv_intake",
) -> PreparedOutcome | None:
    """Return None if row cannot satisfy Trident training minimum (payer + hcpcs)."""
    nk = _row_to_norm_map(raw)

    payer_id = _opt_str(
        _pick(nk, "payer_id", "payer", "payor_id", "payor", "insurance", "payer_code", "primary_insurance")
    )
    hcpcs = _opt_str(_pick(nk, "hcpcs_code", "hcpcs", "procedure_code", "proc_code", "hcpcs_cd", "code"))
    if not payer_id or not hcpcs:
        return None

    order_id = _opt_uuid(_pick(nk, "order_id"))
    claim_number = _opt_str(_pick(nk, "claim_number", "claim_id", "claim_no", "payer_claim_number", "claim"))

    icd10 = _opt_str(_pick(nk, "icd10_code", "icd_10", "icd10", "diagnosis_code", "dx", "primary_dx"))
    diagnosis_blob = _opt_str(_pick(nk, "diagnosis_codes", "diagnoses", "icd_codes"))
    diagnosis_codes = diagnosis_blob or icd10

    payer_name = _opt_str(_pick(nk, "payer_name", "insurance_name"))

    billed = _opt_float(_pick(nk, "billed_amount", "billed", "charge_amount", "total_billed"))
    paid = _opt_float(_pick(nk, "paid_amount", "paid", "payment_amount", "total_paid"))
    denied_amt = _opt_float(_pick(nk, "denied_amount", "denial_amount", "adjustment_amount"))

    if billed is None and denied_amt is not None:
        billed = denied_amt
    if paid is None:
        paid = 0.0

    is_denial = _infer_is_denial(nk, default=default_is_denial)

    dos = _opt_date(_pick(nk, "date_of_service", "dos", "service_date", "from_dos", "denial_date"))
    denial_date = _opt_date(_pick(nk, "denial_date", "denied_date"))

    denial_reason = _opt_str(_pick(nk, "denial_reason", "denial_category", "remark", "notes", "claim_status", "status"))
    carc = _opt_str(_pick(nk, "carc_code", "carc", "claim_adjustment_reason"))
    rarc = _opt_str(_pick(nk, "rarc_code", "rarc", "remittance_advice_remark"))

    pid = str(uuid.uuid4())

    values = (
        pid,
        org_id,
        order_id,
        claim_number,
        payer_id,
        payer_name,
        hcpcs,
        icd10,
        diagnosis_codes,
        billed,
        paid,
        is_denial,
        denial_reason,
        carc,
        rarc,
        dos or denial_date,
        eob_reference,
        record_source,
    )
    return PreparedOutcome(values=values)


INSERT_SQL = """
INSERT INTO payment_outcomes (
    id, org_id, order_id, claim_number, payer_id, payer_name, hcpcs_code, icd10_code,
    diagnosis_codes, billed_amount, paid_amount, is_denial, denial_reason, carc_code, rarc_code,
    date_of_service, adjudicated_at, eob_reference, source
)
VALUES (
    %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s,
    %s, %s::numeric, %s::numeric, %s, %s, %s, %s,
    %s::date, NOW(), %s, %s
)
"""


async def fetch_default_org_id(conn) -> str | None:
    """Async connection from psycopg_pool — use cursor()."""
    import os

    env = (os.getenv("DEFAULT_TRAINING_ORG_ID") or os.getenv("POSEIDON_DEFAULT_ORG_ID") or "").strip()
    if env:
        try:
            uuid.UUID(env)
            return env
        except ValueError:
            logger.warning("DEFAULT_TRAINING_ORG_ID is not a valid UUID; ignoring")

    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT id::text FROM organizations "
            "WHERE COALESCE(is_active, active, TRUE) ORDER BY created_at NULLS LAST LIMIT 1"
        )
        one = await cur.fetchone()
        return str(one[0]) if one else None


async def bulk_insert_payment_outcomes(
    conn,
    prepared: list[PreparedOutcome],
    *,
    chunk_size: int = 400,
) -> int:
    if not prepared:
        return 0
    total = 0
    async with conn.cursor() as cur:
        for i in range(0, len(prepared), chunk_size):
            chunk = prepared[i : i + chunk_size]
            await cur.executemany(INSERT_SQL, [p.values for p in chunk])
            total += len(chunk)
    return total


async def ingest_denial_rows(
    pool: Any,
    raw_rows: list[dict[str, Any]],
    *,
    filename: str,
    default_is_denial: bool = True,
) -> dict[str, Any]:
    """
    Insert normalized denial / outcome rows into payment_outcomes for Trident training.
    """
    eob_reference = f"denial_csv:{filename}"
    skipped = 0
    prepared: list[PreparedOutcome] = []
    org_id: str | None = None
    inserted = 0

    async with pool.connection() as conn:
        org_id = await fetch_default_org_id(conn)

        for raw in raw_rows:
            pr = prepare_payment_outcome_row(
                raw,
                org_id=org_id,
                eob_reference=eob_reference,
                default_is_denial=default_is_denial,
            )
            if pr is None:
                skipped += 1
                continue
            prepared.append(pr)

        async with conn.transaction():
            inserted = await bulk_insert_payment_outcomes(conn, prepared)

    return {
        "inserted": inserted,
        "skipped_missing_payer_or_hcpcs": skipped,
        "org_id": org_id,
        "filename": filename,
    }
