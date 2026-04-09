# =============================================================================
# POSEIDON Core API — Port 8001
# Patient/Order lifecycle, document generation, auth, KPIs
# =============================================================================

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import os
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Annotated, Any, NamedTuple

import bcrypt
import httpx
import jwt
from fastapi import Body, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from minio import Minio
from minio.error import S3Error
from pydantic import BaseModel, EmailStr, field_validator
from psycopg.errors import UniqueViolation
from psycopg.rows import dict_row  # type: ignore[import-untyped]
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

# Shared module: Docker has /app/shared; local/linter uses repo/services/shared
_shared_dir = Path("/app/shared") if Path("/app/shared").exists() else (Path(__file__).resolve().parent.parent / "shared")
sys.path.insert(0, str(_shared_dir))
from base import create_app, get_db, get_redis, logger, settings
from pod_guidance import (
    CMS_CHECKLIST_BODY,
    GUIDANCE_DISCLAIMER,
    POD_TEMPLATE_BODY,
    pod_delivery_guidance_payload,
    staff_instructions_for_order,
)
from availity_client import (
    AvailityConfigError,
    submit_eligibility_270,
    parse_271_basic,
    submit_claim_837,
    parse_997_basic,
    parse_835_basic,
)
from intake_pipeline import (
    INTAKE_CASE_CREATED,
    INTAKE_INCOMPLETE,
    INTAKE_PROCESSED,
    INTAKE_RECEIVED,
    MatchTier,
    intake_transition_allowed,
    match_form_patient_for_intake,
    normalize_form_identity,
    resolve_fax_patient_with_pipeline,
)

# ---------------------------------------------------------------------------
app = create_app(
    title="POSEIDON Core API",
    version="2.0.0",
    description="A CRM meets EMR: patient/order lifecycle, document generation, KPIs, full patient record",
)
security = HTTPBearer()

POSEIDON_EXPECTED_SCHEMA_VERSION = 14

_core_schema_verified = False
_core_schema_gate_lock: asyncio.Lock | None = None


def sql(query: str) -> str:
    return re.sub(r"\$\d+", "%s", query)


async def fetch_one(conn, query: str, *params):
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql(query), params)
        return await cur.fetchone()


async def fetch_all(conn, query: str, *params):
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(sql(query), params)
        return await cur.fetchall()


async def exec_write(conn, query: str, *params) -> int:
    async with conn.cursor() as cur:
        await cur.execute(sql(query), params)
        return cur.rowcount


async def _table_columns(conn, table_name: str, schema: str = "public") -> set[str]:
    rows = await fetch_all(
        conn,
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        """,
        schema,
        table_name,
    )
    return {str(row["column_name"]) for row in rows}


async def _assert_core_schema_version_and_columns(conn) -> None:
    try:
        row = await fetch_one(conn, "SELECT version FROM schema_version WHERE id = 1")
    except Exception:
        logger.warning("schema_version table missing — auto-creating via migration 014")
        await conn.execute("""
            ALTER TABLE orders ADD COLUMN IF NOT EXISTS claim_strategy TEXT;
            ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_claim_strategy_check;
            ALTER TABLE orders ADD CONSTRAINT orders_claim_strategy_check
                CHECK (claim_strategy IS NULL OR claim_strategy IN ('AVAILITY', 'EDI'));
            CREATE INDEX IF NOT EXISTS idx_orders_org_claim_strategy ON orders (org_id, claim_strategy)
                WHERE claim_strategy IS NOT NULL;
            ALTER TABLE claim_submissions ADD COLUMN IF NOT EXISTS submission_format VARCHAR(32);
            CREATE TABLE IF NOT EXISTS schema_version (
                id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                version INTEGER NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            INSERT INTO schema_version (id, version, updated_at)
                VALUES (1, 14, NOW()) ON CONFLICT (id) DO NOTHING;
            UPDATE schema_version SET version = GREATEST(version, 14), updated_at = NOW() WHERE id = 1;
        """)
        row = await fetch_one(conn, "SELECT version FROM schema_version WHERE id = 1")
    if not row:
        raise RuntimeError("schema_version missing (id=1); apply migrations through 014_claim_authority_schema_parity.sql")
    ver = int(row.get("version") or 0)
    if ver < POSEIDON_EXPECTED_SCHEMA_VERSION:
        raise RuntimeError(
            f"schema_version is {ver}; Core requires >= {POSEIDON_EXPECTED_SCHEMA_VERSION}. Run migrations."
        )
    ocols = await _table_columns(conn, "orders")
    if "claim_strategy" not in ocols:
        raise RuntimeError("orders.claim_strategy missing; apply migration 014")
    ccols = await _table_columns(conn, "claim_submissions")
    if "submission_format" not in ccols:
        raise RuntimeError("claim_submissions.submission_format missing; apply migration 014")


def _require_claim_strategy_availity(claim_strategy: Any) -> None:
    raw = (str(claim_strategy).strip() if claim_strategy is not None else "") or None
    if raw is None:
        raise HTTPException(
            status_code=409,
            detail="claim_strategy must be set to AVAILITY or EDI on the order before Availity claim submission",
        )
    if raw != "AVAILITY":
        raise HTTPException(
            status_code=409,
            detail="Order claim_strategy is not AVAILITY; use EDI submission or change claim_strategy to AVAILITY",
        )


async def _safe_fetch_all(
    conn,
    query: str,
    *params,
    label: str,
) -> list[dict[str, Any]]:
    try:
        rows = await fetch_all(conn, query, *params)
    except Exception as exc:
        logger.warning("Patient chart skipped %s due to query failure: %s", label, exc)
        return []
    return [dict(row) for row in rows]


async def _require_fax_log(conn) -> None:
    """fax_log must exist (see scripts/init.sql and migrations); no runtime DDL."""
    try:
        await fetch_one(conn, "SELECT 1 FROM fax_log LIMIT 1")
    except Exception as exc:
        logger.error("fax_log not available: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Fax storage is not available. Apply database migrations (fax_log).",
        ) from exc


async def audit_log(
    conn,
    org_id: str,
    user_id: str,
    action: str,
    resource: str,
    resource_id: str | None = None,
    ip_address: str | None = None,
) -> None:
    """PHI-safe audit log for compliance (who did what, when)."""
    await exec_write(
        conn,
        """
        INSERT INTO audit_log (org_id, user_id, action, resource, resource_id, ip_address)
        VALUES ($1,$2,$3,$4,$5,$6)
        """,
        org_id,
        user_id,
        action,
        resource,
        resource_id,
        ip_address or None,
    )


def _client_ip(request: Request) -> str | None:
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _coerce_json_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
        return [value] if value else []
    return []


def _days_since(value: Any) -> int:
    if not value:
        return 0
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return 0
    if getattr(value, "tzinfo", None) is None:
        value = value.replace(tzinfo=timezone.utc)
    return max(0, (datetime.now(timezone.utc) - value).days)


def _normalize_protocol_status(status: str | None) -> str:
    """Map DB order.status values onto the predictive protocol branches."""
    s = (status or "").lower()
    if s in {"paid", "closed"}:
        return "paid"
    if s in {"appeal_pending", "appeal_submitted"}:
        return "appealed"
    if s in {"auth_approved", "ready_to_submit", "physician_signature", "documents_pending"}:
        return "authorized"
    if s in {"pending_payment", "partial_payment"}:
        return "submitted"
    if s in {"intake", "eligibility_check", "eligibility_failed", "write_off", "cancelled"}:
        return "draft"
    return s or "draft"


def _build_outstanding_protocol(row: dict[str, Any]) -> dict[str, Any]:
    raw_status = str(row.get("status") or "")
    status = _normalize_protocol_status(raw_status)
    payer_name = row.get("payer_name") or row.get("payer_id")
    hcpcs_codes = _coerce_json_list(row.get("hcpcs_codes"))
    baseline_denial_rate = float(row.get("baseline_denial_rate") or 0.35)
    days_in_stage = _days_since(row.get("updated_at") or row.get("created_at"))
    denied_amount = float(row.get("denied_amount") or 0)
    paid_amount = float(row.get("paid_amount") or 0)
    outstanding_amount = denied_amount if denied_amount > 0 else max(0.0, denied_amount - paid_amount)
    if outstanding_amount == 0 and denied_amount == 0:
        outstanding_amount = None

    protocol_type = "follow_up"
    next_action = "Review order"
    priority = "normal"
    collection_probability = max(0.1, round(1.0 - baseline_denial_rate, 2))
    predicted_payment_days = 30
    notes: list[str] = []

    if status == "paid":
        protocol_type = "reconciled"
        priority = "normal"
        next_action = "Claim paid or closed — reconcile cash and close tasks"
        collection_probability = 1.0
        predicted_payment_days = 0
        notes.append("Terminal state for payment forecasting")
    elif status == "denied":
        protocol_type = "appeal_kill"
        priority = "urgent"
        appeal_deadline = row.get("appeal_deadline")
        days_to_deadline = None
        if appeal_deadline:
            if isinstance(appeal_deadline, str):
                try:
                    appeal_deadline_dt = datetime.fromisoformat(appeal_deadline)
                except ValueError:
                    appeal_deadline_dt = None
            else:
                appeal_deadline_dt = datetime.combine(appeal_deadline, datetime.min.time(), tzinfo=timezone.utc)
            if appeal_deadline_dt:
                days_to_deadline = (appeal_deadline_dt.date() - datetime.now(timezone.utc).date()).days
                notes.append(f"{days_to_deadline} days to appeal deadline")
        next_action = (
            f"Appeal immediately for {row.get('denial_category') or 'denial'}"
            if days_to_deadline is None or days_to_deadline >= 0
            else "Appeal window likely missed; escalate for write-off review"
        )
        collection_probability = 0.4 if (days_to_deadline is None or days_to_deadline >= 0) else 0.1
        predicted_payment_days = 21 if days_to_deadline is None or days_to_deadline >= 0 else 0
    elif status in {"draft", "pending_auth"}:
        protocol_type = "pre_submit_run"
        priority = "urgent" if days_in_stage >= 2 else "warning"
        next_action = "Complete eligibility and authorization run"
        collection_probability = max(0.25, round(collection_probability - 0.15, 2))
        predicted_payment_days = 35
    elif status == "authorized":
        protocol_type = "submission_run"
        priority = "warning"
        next_action = "Submit claim now and confirm clean-claim package"
        collection_probability = max(0.35, round(collection_probability - 0.05, 2))
        predicted_payment_days = 28
    elif status == "submitted":
        protocol_type = "payment_watch"
        priority = "warning" if days_in_stage >= 14 else "normal"
        next_action = "Follow payer for status and expected adjudication"
        if days_in_stage >= 21:
            next_action = "Escalate payer follow-up; payment aging beyond 21 days"
        predicted_payment_days = 10 if days_in_stage >= 21 else 18
    elif status == "appealed":
        protocol_type = "appeal_watch"
        priority = "urgent" if days_in_stage >= 10 else "warning"
        next_action = "Track appeal determination and payer acknowledgment"
        collection_probability = 0.45
        predicted_payment_days = 18

    predicted_payment_date = None
    if predicted_payment_days > 0:
        predicted_payment_date = (
            datetime.now(timezone.utc) + timedelta(days=predicted_payment_days)
        ).date().isoformat()

    ad = row.get("appeal_deadline")
    appeal_deadline_out = None
    if ad is not None and getattr(ad, "isoformat", None):
        appeal_deadline_out = ad.isoformat()
    elif isinstance(ad, str):
        appeal_deadline_out = ad

    return {
        "order_id": str(row["id"]),
        "patient_id": str(row["patient_id"]),
        "patient_name": f"{row.get('first_name', '')} {row.get('last_name', '')}".strip(),
        "payer_id": row.get("payer_id"),
        "payer_name": payer_name,
        "status": status,
        "status_code": raw_status,
        "priority": priority,
        "protocol_type": protocol_type,
        "next_action": next_action,
        "days_in_stage": days_in_stage,
        "hcpcs_codes": hcpcs_codes,
        "denial_category": row.get("denial_category"),
        "appeal_deadline": appeal_deadline_out,
        "predicted_payment_date": predicted_payment_date,
        "predicted_payment_window_days": predicted_payment_days,
        "estimated_collection_probability": collection_probability,
        "outstanding_amount": outstanding_amount,
        "notes": notes,
    }


def _catalogue_payload(order: dict[str, Any]) -> dict[str, Any]:
    vertical = str(order.get("vertical") or "").strip()
    product_category = str(order.get("product_category") or "").strip()
    source = str(order.get("source") or "").strip()
    source_channel = str(order.get("source_channel") or "manual").strip()
    source_reference = str(order.get("source_reference") or "").strip()
    parts: list[str] = []
    if vertical:
        parts.append(f"Vertical: {vertical.upper()}")
    if product_category:
        parts.append(f"Category: {product_category}")
    if source_channel:
        parts.append(f"Channel: {source_channel}")
    if source and source.lower() != source_channel.lower():
        parts.append(f"Source: {source}")
    if source_reference:
        parts.append(f"Ref: {source_reference}")
    label = " · ".join(parts) if parts else "Default catalogue (manual / unspecified)"
    return {
        "label": label,
        "vertical": vertical or None,
        "product_category": product_category or None,
        "source_channel": source_channel or None,
        "source": source or None,
        "source_reference": source_reference or None,
    }


async def _fetch_learned_rates_map(
    conn, org_id: str, payer_id: str | None, codes: list[str]
) -> dict[str, dict[str, Any]]:
    if not payer_id or not codes:
        return {}
    clean_codes = sorted({str(c).strip().upper() for c in codes if c})
    if not clean_codes:
        return {}
    rows = await fetch_all(
        conn,
        """
        SELECT DISTINCT ON (hcpcs_code)
            hcpcs_code,
            avg_paid,
            median_paid,
            min_paid,
            max_paid,
            denial_rate,
            sample_count
        FROM learned_rates
        WHERE payer_id = $1
          AND hcpcs_code = ANY($2::text[])
          AND (org_id::text = $3 OR org_id IS NULL)
        ORDER BY hcpcs_code,
                 CASE WHEN org_id::text = $3 THEN 0 WHEN org_id IS NULL THEN 1 ELSE 2 END,
                 sample_count DESC NULLS LAST
        """,
        payer_id,
        clean_codes,
        str(org_id),
    )
    return {str(r["hcpcs_code"]).upper(): dict(r) for r in rows}


async def _enrich_chart_order_bundle(
    conn,
    org_id: str,
    bundle: dict[str, Any],
    denial_for_order: dict[str, Any] | None,
) -> None:
    payer_id = bundle.get("payer_id")
    if isinstance(payer_id, str):
        payer_id = payer_id.strip() or None
    base_codes = _coerce_json_list(bundle.get("hcpcs_codes"))
    line_items: list[dict[str, Any]] = [dict(x) for x in (bundle.get("line_items") or [])]
    if not line_items:
        for code in base_codes:
            if not code:
                continue
            line_items.append(
                {
                    "id": None,
                    "order_id": bundle.get("id"),
                    "hcpcs_code": str(code).strip().upper(),
                    "modifier": None,
                    "description": None,
                    "quantity": 1,
                    "unit_price": None,
                    "billed_amount": None,
                    "allowed_amount": None,
                    "paid_amount": None,
                    "is_billable": True,
                    "_synthetic": True,
                }
            )
    codes_for_rates: list[str] = []
    for li in line_items:
        c = li.get("hcpcs_code")
        if c:
            codes_for_rates.append(str(c).strip().upper())
    for c in base_codes:
        if c:
            cu = str(c).strip().upper()
            if cu not in codes_for_rates:
                codes_for_rates.append(cu)
    rates = await _fetch_learned_rates_map(conn, org_id, str(payer_id) if payer_id else None, codes_for_rates)

    try:
        order_allowed = float(bundle.get("total_allowed") or 0)
    except (TypeError, ValueError):
        order_allowed = 0.0
    try:
        order_billed = float(bundle.get("total_billed") or 0)
    except (TypeError, ValueError):
        order_billed = 0.0
    n_alloc = max(len(line_items), 1)

    enriched_items: list[dict[str, Any]] = []
    for li in line_items:
        item = dict(li)
        code = str(item.get("hcpcs_code") or "").strip().upper()
        qty = max(int(item.get("quantity") or 1), 1)
        lr = rates.get(code) if code else None
        allowed = item.get("allowed_amount")
        billed = item.get("billed_amount")
        try:
            f_allowed = float(allowed) if allowed is not None else None
        except (TypeError, ValueError):
            f_allowed = None
        try:
            f_billed = float(billed) if billed is not None else None
        except (TypeError, ValueError):
            f_billed = None
        expected: float | None = None
        if lr:
            med = lr.get("median_paid") if lr.get("median_paid") is not None else lr.get("avg_paid")
            if med is not None:
                try:
                    expected = float(med) * qty
                except (TypeError, ValueError):
                    expected = None
        if expected is None and f_allowed is not None:
            expected = f_allowed * qty
        if expected is None and order_allowed > 0:
            expected = round(order_allowed / n_alloc, 2) * qty
        if expected is None and f_billed is not None:
            expected = f_billed * qty
        if expected is None and order_billed > 0:
            expected = round(order_billed / n_alloc, 2) * qty
        item["expected_reimbursement"] = round(expected, 2) if expected is not None else None
        item["learned_rate"] = (
            {
                "median_paid": float(lr["median_paid"]) if lr.get("median_paid") is not None else None,
                "avg_paid": float(lr["avg_paid"]) if lr.get("avg_paid") is not None else None,
                "denial_rate": float(lr["denial_rate"]) if lr.get("denial_rate") is not None else None,
                "sample_count": int(lr["sample_count"] or 0),
            }
            if lr
            else None
        )
        enriched_items.append(item)

    bundle["billing_line_items"] = _serialize(enriched_items)
    bundle["catalogue"] = _catalogue_payload(bundle)

    br = bundle.get("payer_baseline_denial_rate")
    try:
        baseline = float(br) if br is not None else 0.35
    except (TypeError, ValueError):
        baseline = 0.35

    proto_row: dict[str, Any] = {
        "id": bundle.get("id"),
        "patient_id": bundle.get("patient_id"),
        "first_name": bundle.get("patient_first_name"),
        "last_name": bundle.get("patient_last_name"),
        "status": bundle.get("status"),
        "payer_id": bundle.get("payer_id"),
        "payer_name": bundle.get("payer_name") or bundle.get("payer_id"),
        "hcpcs_codes": bundle.get("hcpcs_codes"),
        "baseline_denial_rate": baseline,
        "updated_at": bundle.get("updated_at"),
        "created_at": bundle.get("created_at"),
        "denied_amount": bundle.get("denied_amount"),
        "paid_amount": bundle.get("paid_amount"),
        "denial_category": bundle.get("denial_category"),
    }
    if denial_for_order:
        proto_row["appeal_deadline"] = denial_for_order.get("appeal_deadline")

    pred = _build_outstanding_protocol(proto_row)
    drs = bundle.get("denial_risk_score")
    if drs is not None:
        try:
            pred["denial_risk_score"] = float(drs)
        except (TypeError, ValueError):
            pred["denial_risk_score"] = None
    else:
        pred["denial_risk_score"] = None
    pred["risk_tier"] = bundle.get("risk_tier")
    pred["trident_flags"] = bundle.get("trident_flags")
    bundle["predictive_modeling"] = _serialize(pred)


def _infer_catalog_metadata(hcpcs_codes: list[str]) -> tuple[str, str, str]:
    """Return (vertical, product_category, source catalogue label) from HCPCS list."""
    blob = " ".join(str(c) for c in hcpcs_codes).lower()
    if any(
        k in blob
        for k in (
            "k08",
            "k0001",
            "k0002",
            "k0003",
            "k0004",
            "k0005",
            "k0333",
            "wheelchair",
            "mobility",
            "crt",
            "power chair",
        )
    ):
        return "mobility", "Complex mobility & CRT", "Matia mobility catalogue"
    if any(k in blob for k in ("biolog", "graft", "amniotic", "tissue matrix", "q4")):
        return "biologics", "Tissue & biologics", "Biologics formulary catalogue"
    if any(k in blob for k in ("implant", "stimulator", "l8680", "fusion")):
        return "dme", "Surgical implants & supplies", "Implant device catalogue"
    return "dme", "DME & supplies", "StrykeFox DME catalogue"


async def _seed_order_line_items_from_hcpcs(conn: Any, order_id: str, hcpcs_codes: list[str]) -> None:
    if not hcpcs_codes:
        return
    existing = await fetch_one(
        conn,
        "SELECT 1 AS x FROM order_line_items WHERE order_id = $1 LIMIT 1",
        order_id,
    )
    if existing:
        return
    for code in hcpcs_codes:
        c = str(code or "").strip().upper()
        if not c:
            continue
        await exec_write(
            conn,
            """
            INSERT INTO order_line_items (id, order_id, hcpcs_code, quantity, is_billable)
            VALUES ($1, $2, $3, 1, true)
            """,
            str(uuid.uuid4()),
            order_id,
            c,
        )


async def _seed_order_diagnoses_from_codes(conn: Any, order_id: str, diagnosis_codes: list[str]) -> None:
    if not diagnosis_codes:
        return
    existing = await fetch_one(
        conn,
        "SELECT 1 AS x FROM order_diagnoses WHERE order_id = $1 LIMIT 1",
        order_id,
    )
    if existing:
        return
    for i, code in enumerate(diagnosis_codes):
        c = str(code or "").strip().upper()
        if not c:
            continue
        await exec_write(
            conn,
            """
            INSERT INTO order_diagnoses (id, order_id, icd10_code, description, is_primary, sequence)
            VALUES ($1, $2, $3, NULL, $4, $5)
            """,
            str(uuid.uuid4()),
            order_id,
            c,
            i == 0,
            i + 1,
        )


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_document_hash(value: Any) -> str | None:
    """SHA-256 hex (64 chars) for deduplication; invalid values ignored."""
    raw = _normalize_text(value).lower()
    if not raw:
        return None
    if re.fullmatch(r"[a-f0-9]{64}", raw):
        return raw
    return None


def _normalize_phone_digits(value: Any) -> str:
    return re.sub(r"\D+", "", _normalize_text(value))


def _split_patient_name(value: Any) -> tuple[str, str]:
    raw = _normalize_text(value)
    if not raw:
        return "", ""
    if "," in raw:
        last, first = [part.strip() for part in raw.split(",", 1)]
        return first, last
    parts = [part for part in re.split(r"\s+", raw) if part]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[-1]


async def _resolve_fax_patient_context(
    conn,
    org_id: str | None,
    payload: "FaxLogEntryPayload",
) -> dict[str, Any]:
    context: dict[str, Any] = {
        "patient_id": None,
        "order_id": None,
        "patient_name": _normalize_text(payload.patient_name) or None,
        "patient_dob": _normalize_text(payload.patient_dob) or None,
        "patient_mrn": _normalize_text(payload.patient_mrn) or None,
        "match_source": None,
    }
    if not org_id:
        return context

    patient_row: dict[str, Any] | None = None
    patient_id = _normalize_text(payload.patient_id)
    if patient_id:
        patient_row = await fetch_one(
            conn,
            """
            SELECT id, first_name, last_name, mrn, COALESCE(date_of_birth::text, dob::text) AS patient_dob
            FROM patients
            WHERE id = $1 AND org_id = $2
            """,
            patient_id,
            org_id,
        )
        if patient_row:
            context["match_source"] = "patient_id"

    if not patient_row:
        patient_mrn = _normalize_text(payload.patient_mrn)
        if patient_mrn:
            patient_row = await fetch_one(
                conn,
                """
                SELECT id, first_name, last_name, mrn, COALESCE(date_of_birth::text, dob::text) AS patient_dob
                FROM patients
                WHERE org_id = $1 AND lower(coalesce(mrn, '')) = lower($2)
                ORDER BY created_at DESC
                LIMIT 1
                """,
                org_id,
                patient_mrn,
            )
            if patient_row:
                context["match_source"] = "mrn"

    if not patient_row:
        first_name, last_name = _split_patient_name(payload.patient_name)
        patient_dob = _normalize_text(payload.patient_dob)
        if first_name and last_name and patient_dob:
            normalized_dob = _normalize_date_string(patient_dob)
            patient_row = await fetch_one(
                conn,
                """
                SELECT id, first_name, last_name, mrn, COALESCE(date_of_birth::text, dob::text) AS patient_dob
                FROM patients
                WHERE org_id = $1
                  AND lower(first_name) = lower($2)
                  AND lower(last_name) = lower($3)
                  AND COALESCE(date_of_birth::text, dob::text) = $4
                ORDER BY created_at DESC
                LIMIT 1
                """,
                org_id,
                first_name,
                last_name,
                normalized_dob,
            )
            if patient_row:
                context["match_source"] = "demographics"

    if patient_row:
        context["patient_id"] = str(patient_row["id"])
        context["patient_name"] = " ".join(
            part for part in [_normalize_text(patient_row.get("first_name")), _normalize_text(patient_row.get("last_name"))] if part
        ) or context["patient_name"]
        context["patient_dob"] = _normalize_text(patient_row.get("patient_dob")) or context["patient_dob"]
        context["patient_mrn"] = _normalize_text(patient_row.get("mrn")) or context["patient_mrn"]

        requested_order_id = _normalize_text(payload.order_id)
        if requested_order_id:
            order_row = await fetch_one(
                conn,
                """
                SELECT id
                FROM orders
                WHERE id = $1 AND org_id = $2 AND patient_id = $3
                """,
                requested_order_id,
                org_id,
                context["patient_id"],
            )
            if order_row:
                context["order_id"] = str(order_row["id"])

        if not context["order_id"]:
            recent_order = await fetch_one(
                conn,
                """
                SELECT id
                FROM orders
                WHERE org_id = $1 AND patient_id = $2
                ORDER BY updated_at DESC NULLS LAST, created_at DESC
                LIMIT 1
                """,
                org_id,
                context["patient_id"],
            )
            if recent_order:
                context["order_id"] = str(recent_order["id"])

    return context


async def _find_recent_outbound_fax(conn, fax_number: str) -> dict[str, Any] | None:
    digits = _normalize_phone_digits(fax_number)
    if not digits:
        return None
    row = await fetch_one(
        conn,
        """
        SELECT id, org_id, patient_id, order_id, fax_number, patient_name, patient_dob, patient_mrn
        FROM fax_log
        WHERE direction = 'outbound'
          AND org_id IS NOT NULL
          AND regexp_replace(coalesce(fax_number, ''), '[^0-9]+', '', 'g') = $1
        ORDER BY created_at DESC
        LIMIT 1
        """,
        digits,
    )
    return dict(row) if row else None


def _inbound_review_state(
    fax_number: str,
    org_id: str | None,
    patient_id: str | None,
    matched_outbound: dict[str, Any] | None,
) -> tuple[str, str]:
    if patient_id:
        return (
            "pending_chart_review",
            f"Return fax from {fax_number} matched a patient chart. Review the received documents before filing them to the chart.",
        )
    if org_id or matched_outbound:
        return (
            "pending_patient_match",
            f"Return fax from {fax_number} needs review. Link it to an existing patient chart or create a new patient.",
        )
    return (
        "unmatched",
        f"Return fax from {fax_number} was received but could not be matched to a patient or outbound request.",
    )


def _parsed_intake_from_fax_payload(payload: "FaxLogEntryPayload") -> dict[str, Any]:
    raw = payload.raw_webhook or {}
    parsed = raw.get("parsed_intake") if isinstance(raw, dict) else None
    return parsed if isinstance(parsed, dict) else {}


def _extract_intake_confidence(
    parsed_intake: dict[str, Any],
    raw_webhook: dict[str, Any],
) -> float | None:
    """Return OCR/confidence score in 0..1, or None if not supplied."""
    candidates: list[Any] = []
    candidates.append(parsed_intake.get("confidence"))
    candidates.append(parsed_intake.get("ocr_confidence"))
    candidates.append(raw_webhook.get("confidence"))
    pi = raw_webhook.get("parsed_intake")
    if isinstance(pi, dict):
        candidates.append(pi.get("confidence"))
        candidates.append(pi.get("ocr_confidence"))
    for c in candidates:
        if c is None:
            continue
        try:
            v = float(str(c).strip()) if not isinstance(c, (int, float)) else float(c)
        except (TypeError, ValueError):
            continue
        if v > 1.0:
            v = v / 100.0
        if 0.0 <= v <= 1.0:
            return v
    return None


def _split_codes(value: Any) -> list[str]:
    if isinstance(value, list):
        items = value
    else:
        items = re.split(r"[\s,]+", _normalize_text(value))
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        code = _normalize_text(item).upper()
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(code)
    return out


def _safe_slug(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", value.upper()).strip("_")


def _normalize_date_string(value: str | None) -> str:
    raw = _normalize_text(value)
    if not raw:
        return "1970-01-01"
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y", "%m-%d-%y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw).date().isoformat()
    except ValueError:
        return "1970-01-01"


def _normalize_timestamp_string(value: str | None) -> str:
    raw = _normalize_text(value)
    if not raw:
        return datetime.now(timezone.utc).isoformat()
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except ValueError:
        return datetime.now(timezone.utc).isoformat()


def _normalize_code_list(value: Any) -> list[str]:
    normalized: list[str] = []
    for item in _coerce_json_list(value):
        text = _normalize_text(item).upper()
        if text:
            normalized.append(text)
    return normalized


def _first_code(value: Any, default: str = "") -> str:
    codes = _normalize_code_list(value)
    return codes[0] if codes else default


def _json_dump(value: Any) -> str:
    return json.dumps(_serialize(value))


async def _fetch_order_learning_context(conn, org_id: str, order_id: str) -> dict[str, Any] | None:
    row = await fetch_one(
        conn,
        """
        SELECT
            o.id,
            o.org_id,
            o.patient_id,
            o.payer_id,
            o.hcpcs_codes,
            o.referring_physician_npi,
            o.date_of_service,
            o.total_billed,
            o.total_paid,
            o.status,
            p.first_name,
            p.last_name,
            p.payer_id AS patient_payer_id,
            p.diagnosis_codes AS patient_diagnosis_codes,
            COALESCE(
                (
                    SELECT json_agg(od.icd10_code ORDER BY od.sequence ASC, od.created_at ASC)
                    FROM order_diagnoses od
                    WHERE od.order_id = o.id
                ),
                '[]'::json
            ) AS order_diagnosis_codes
        FROM orders o
        JOIN patients p ON p.id = o.patient_id
        WHERE o.id = $1 AND o.org_id = $2
        """,
        order_id,
        org_id,
    )
    return dict(row) if row else None


async def _record_learning_outcome(
    conn,
    *,
    org_id: str,
    order_id: str,
    paid_amount: float | None,
    payment_date: str | None = None,
    eob_reference: str | None = None,
    adjustment_codes: list[str] | None = None,
    claim_number: str | None = None,
    is_denial: bool = False,
    denial_reason: str | None = None,
    carc_code: str | None = None,
    rarc_code: str | None = None,
    billed_amount: float | None = None,
    created_by: str | None = None,
) -> str | None:
    context = await _fetch_order_learning_context(conn, org_id, order_id)
    if not context:
        return None

    diagnosis_codes = _normalize_code_list(
        context.get("order_diagnosis_codes") or context.get("patient_diagnosis_codes")
    )
    hcpcs_codes = _normalize_code_list(context.get("hcpcs_codes"))
    outcome_id = str(uuid.uuid4())
    dos_value = context.get("date_of_service")
    if hasattr(dos_value, "isoformat"):
        date_of_service = dos_value.isoformat()
    else:
        date_of_service = _normalize_text(dos_value) or None

    await exec_write(
        conn,
        """
        INSERT INTO payment_outcomes (
            id, org_id, order_id, claim_number, payer_id, payer_name, hcpcs_code, icd10_code,
            diagnosis_codes, billed_amount, paid_amount, is_denial, denial_reason, carc_code, rarc_code,
            date_of_service, adjudicated_at, payment_date, eob_reference, adjustment_codes, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),$17,$18,$19,$20)
        """,
        outcome_id,
        org_id,
        order_id,
        claim_number,
        context.get("payer_id") or context.get("patient_payer_id"),
        None,
        _first_code(hcpcs_codes),
        _first_code(diagnosis_codes),
        json.dumps(diagnosis_codes),
        billed_amount if billed_amount is not None else context.get("total_billed"),
        paid_amount,
        is_denial,
        denial_reason,
        carc_code,
        rarc_code,
        date_of_service,
        payment_date,
        eob_reference,
        _json_dump(adjustment_codes or []),
        created_by,
    )
    return outcome_id


async def _persist_eligibility_result(
    conn,
    *,
    patient_id: str,
    order_id: str | None,
    payer_id: str | None,
    raw_result: dict[str, Any],
    parsed_summary: dict[str, Any] | None,
) -> None:
    status_code = int(raw_result.get("status_code") or 0)
    summary = parsed_summary or {}
    status_value = "error"
    if status_code < 400:
        status_value = "eligible" if summary.get("eligible") else "ineligible"

    await exec_write(
        conn,
        """
        INSERT INTO eligibility_checks (
            id, order_id, patient_id, payer_id, status, is_eligible, coverage_details, raw_response, checked_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        """,
        str(uuid.uuid4()),
        order_id,
        patient_id,
        payer_id,
        status_value,
        summary.get("eligible") if summary else None,
        _json_dump(summary),
        _json_dump(raw_result),
    )
    if order_id:
        await exec_write(
            conn,
            """
            UPDATE orders
            SET eligibility_status = $1,
                eligibility_summary = $2::jsonb,
                updated_at = NOW()
            WHERE id = $3
            """,
            status_value,
            _json_dump(summary),
            order_id,
        )


async def _persist_claim_submission(
    conn,
    *,
    org_id: str,
    order_id: str,
    payer_id: str | None,
    submission_format: str,
    submission_payload: dict[str, Any],
    acknowledgment_payload: dict[str, Any],
) -> None:
    status_code = int(acknowledgment_payload.get("status_code") or 0)
    summary = acknowledgment_payload.get("summary") or {}
    accepted = bool(summary.get("accepted")) if isinstance(summary, dict) else False
    status_value = "error" if status_code >= 500 else ("accepted" if accepted else "submitted")
    failure_reason = None if status_code < 400 else _normalize_text((acknowledgment_payload.get("body") or ""))[:500]

    try:
        await exec_write(
            conn,
            """
            INSERT INTO claim_submissions (
                id, order_id, org_id, payer_id, submission_format, submission_payload, acknowledgment_payload,
                status, failure_reason, submitted_at, acknowledged_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),CASE WHEN $10 < 500 THEN NOW() ELSE NULL END)
            """,
            str(uuid.uuid4()),
            order_id,
            org_id,
            payer_id,
            submission_format,
            _json_dump(submission_payload),
            _json_dump(acknowledgment_payload),
            status_value,
            failure_reason,
            status_code,
        )
    except UniqueViolation as exc:
        raise HTTPException(
            status_code=409,
            detail="Duplicate successful claim submission for this order (database enforced).",
        ) from exc
    await exec_write(
        conn,
        """
        UPDATE orders
        SET status = CASE WHEN $1 < 500 THEN 'submitted' ELSE status END,
            billing_status = CASE WHEN $1 < 500 THEN 'submitted' ELSE billing_status END,
            submitted_at = CASE WHEN $1 < 500 THEN NOW() ELSE submitted_at END,
            updated_at = NOW()
        WHERE id = $2 AND org_id = $3
        """,
        status_code,
        order_id,
        org_id,
    )


async def _precheck_order_for_claim_submission(conn, org_id: str, order_id: str) -> dict[str, Any]:
    """Billing-ready + at-most-one successful claim row (application check; DB index also enforces)."""
    row = await fetch_one(
        conn,
        """
        SELECT id, billing_ready_at, billing_status, status, patient_id, payer_id, referring_physician_npi, hcpcs_codes, claim_strategy
        FROM orders
        WHERE id = $1 AND org_id = $2
        """,
        order_id,
        org_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    _require_claim_strategy_availity(row.get("claim_strategy"))
    if settings.billing_claim_require_billing_ready and not row.get("billing_ready_at"):
        raise HTTPException(
            status_code=409,
            detail="Order is not billing-ready (billing_ready_at not set). Complete delivery/POD workflow before claim submission.",
        )
    if settings.billing_claim_block_duplicate_submission:
        dup = await fetch_one(
            conn,
            """
            SELECT id, status FROM claim_submissions
            WHERE order_id = $1 AND org_id = $2::uuid
              AND status IN ('submitted', 'accepted')
            ORDER BY COALESCE(submitted_at, created_at) DESC NULLS LAST
            LIMIT 1
            """,
            order_id,
            org_id,
        )
        if dup:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "A claim submission already exists for this order",
                    "claim_submission_id": str(dup["id"]),
                    "status": dup.get("status"),
                },
            )
    return dict(row)


async def _load_order_patient_for_837_with_claim_lock(
    conn,
    org_id: str,
    order_id: str,
) -> tuple[dict[str, Any], dict[str, Any], tuple[str | None, str | None]]:
    """FOR UPDATE order + same prechecks as _precheck (billing-ready, duplicate claim)."""
    order = await fetch_one(
        conn,
        """
        SELECT id, patient_id, payer_id, referring_physician_npi, hcpcs_codes, billing_ready_at, billing_status, status, claim_strategy
        FROM orders
        WHERE id = $1 AND org_id = $2
        FOR UPDATE
        """,
        order_id,
        org_id,
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _require_claim_strategy_availity(order.get("claim_strategy"))
    if settings.billing_claim_require_billing_ready and not order.get("billing_ready_at"):
        raise HTTPException(
            status_code=409,
            detail="Order is not billing-ready (billing_ready_at not set). Complete delivery/POD workflow before claim submission.",
        )
    if settings.billing_claim_block_duplicate_submission:
        dup = await fetch_one(
            conn,
            """
            SELECT id FROM claim_submissions
            WHERE order_id = $1 AND org_id = $2::uuid
              AND status IN ('submitted', 'accepted')
            LIMIT 1
            """,
            order_id,
            org_id,
        )
        if dup:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "A claim submission already exists for this order",
                    "claim_submission_id": str(dup["id"]),
                },
            )
    patient = await fetch_one(
        conn,
        """
        SELECT id, first_name, last_name, dob, insurance_id, payer_id, address, diagnosis_codes
        FROM patients
        WHERE id = $1 AND org_id = $2
        """,
        order["patient_id"],
        org_id,
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    internal_pid = order.get("payer_id") or patient.get("payer_id")
    edi_pair: tuple[str | None, str | None] = (None, None)
    if internal_pid:
        edi_pair = await _fetch_availity_payer_edi(conn, str(internal_pid))
    return dict(order), dict(patient), edi_pair


async def _resolve_assignee(
    conn,
    org_id: str,
    preferred_user_id: str | None = None,
    preferred_email: str | None = None,
    role_hint: str | None = None,
    seed: str | None = None,
) -> str | None:
    normalized_user_id = _normalize_text(preferred_user_id)
    if normalized_user_id:
        row = await fetch_one(
            conn,
            "SELECT id FROM users WHERE id = $1 AND org_id = $2 AND active = true",
            normalized_user_id,
            org_id,
        )
        if row:
            return str(row["id"])

    normalized_email = _normalize_text(preferred_email).lower()
    if normalized_email:
        row = await fetch_one(
            conn,
            "SELECT id FROM users WHERE lower(email) = $1 AND org_id = $2 AND active = true",
            normalized_email,
            org_id,
        )
        if row:
            return str(row["id"])

    role_order = [role_hint] if role_hint else []
    for fallback_role in ["intake", "billing", "rep", "admin"]:
        if fallback_role not in role_order:
            role_order.append(fallback_role)

    candidates: list[dict[str, Any]] = []
    for role in role_order:
        rows = await fetch_all(
            conn,
            """
            SELECT id, email, created_at
            FROM users
            WHERE org_id = $1 AND role = $2 AND active = true
            ORDER BY created_at ASC, email ASC
            """,
            org_id,
            role,
        )
        if rows:
            candidates = [dict(r) for r in rows]
            break

    if not candidates:
        return None

    selector = _normalize_text(seed) or normalized_email or normalized_user_id or "poseidon"
    digest = hashlib.sha256(selector.encode("utf-8")).hexdigest()
    index = int(digest[:8], 16) % len(candidates)
    return str(candidates[index]["id"])


def _display_assignee(row: dict[str, Any]) -> str:
    first = _normalize_text(row.get("assigned_first_name"))
    last = _normalize_text(row.get("assigned_last_name"))
    full_name = " ".join(part for part in [first, last] if part)
    if full_name:
        initials = "".join(part[0] for part in full_name.split()[:2]).upper()
        return initials or full_name[:2].upper()

    email = _normalize_text(row.get("assigned_email"))
    if email:
        return email.split("@", 1)[0][:2].upper()

    return "OS"


async def _record_workflow_event(
    conn,
    org_id: str,
    event_type: str,
    payload: dict[str, Any],
    order_id: str | None = None,
) -> None:
    await exec_write(
        conn,
        """
        INSERT INTO workflow_events (org_id, order_id, event_type, payload)
        VALUES ($1,$2,$3,$4)
        """,
        org_id,
        order_id,
        event_type,
        json.dumps(payload),
    )


async def _create_notification(
    conn,
    org_id: str,
    notification_type: str,
    title: str,
    message: str,
    payload: dict[str, Any],
    user_id: str | None = None,
    order_id: str | None = None,
) -> None:
    await exec_write(
        conn,
        """
        INSERT INTO notifications (org_id, user_id, order_id, notification_type, title, message, payload)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        """,
        org_id,
        user_id,
        order_id,
        notification_type,
        title,
        message,
        json.dumps(payload),
    )


def _safe_json(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(k): _safe_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_safe_json(item) for item in value]
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    return str(value)


async def _fetch_order_context(conn, org_id: str, order_id: str) -> dict[str, Any] | None:
    row = await fetch_one(
        conn,
        """
        SELECT o.id, o.org_id, o.patient_id, o.assigned_to, o.status, o.priority,
               o.payer_id, o.hcpcs_codes, o.referring_physician_npi, o.notes,
               o.eligibility_status, o.eligibility_summary, o.swo_status, o.swo_request_id, o.swo_sign_url,
               o.fulfillment_status, o.tracking_number, o.tracking_carrier, o.tracking_status, o.tracking_url,
               o.delivered_at, o.pod_status, o.pod_sent_at, o.pod_received_at,
               o.billing_status, o.billing_ready_at,
               p.first_name, p.last_name, p.dob, p.email AS patient_email, p.insurance_id, p.diagnosis_codes,
               p.address, p.payer_id AS patient_payer_id,
               au.email AS assigned_email, au.first_name AS assigned_first_name, au.last_name AS assigned_last_name
        FROM orders o
        JOIN patients p ON p.id = o.patient_id
        LEFT JOIN users au ON au.id = o.assigned_to
        WHERE o.id = $1 AND o.org_id = $2
        """,
        order_id,
        org_id,
    )
    return dict(row) if row else None


async def _run_eligibility_workflow(
    conn,
    org_id: str,
    order_id: str,
) -> dict[str, Any]:
    context = await _fetch_order_context(conn, org_id, order_id)
    if not context:
        raise HTTPException(status_code=404, detail="Order not found")

    payer_id = context.get("payer_id") or context.get("patient_payer_id")
    if not payer_id:
        raise HTTPException(status_code=400, detail="Missing payer_id on order")

    patient = {
        "first_name": context.get("first_name"),
        "last_name": context.get("last_name"),
        "dob": context.get("dob").isoformat() if getattr(context.get("dob"), "isoformat", None) else context.get("dob"),
        "insurance_id": context.get("insurance_id"),
    }
    order = {
        "id": context.get("id"),
        "payer_id": payer_id,
        "referring_physician_npi": context.get("referring_physician_npi"),
        "hcpcs_codes": _coerce_json_list(context.get("hcpcs_codes")),
    }
    service_date = datetime.now(timezone.utc).strftime("%Y%m%d")
    edi_name, edi_pi = await _fetch_availity_payer_edi(conn, str(payer_id))
    edi_270 = _build_270_from_records(
        patient, order, payer_id, service_date, edi_payer_name=edi_name, edi_payer_pi=edi_pi
    )

    try:
        result = await submit_eligibility_270(edi_270, correlation_id=order_id)
        parsed = parse_271_basic(result.get("body", "")) if isinstance(result.get("body"), str) else {}
        eligible = bool(parsed.get("eligible"))
        eligibility_status = "eligible" if eligible else "ineligible"
        summary = {
            "status_code": result.get("status_code"),
            "summary": parsed,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }
    except AvailityConfigError as exc:
        eligibility_status = "error"
        summary = {"error": str(exc), "checked_at": datetime.now(timezone.utc).isoformat()}
    except Exception as exc:
        logger.exception("Eligibility workflow failed for order=%s", order_id)
        eligibility_status = "error"
        summary = {"error": str(exc), "checked_at": datetime.now(timezone.utc).isoformat()}

    await exec_write(
        conn,
        """
        UPDATE orders
        SET eligibility_status = $1, eligibility_summary = $2, updated_at = NOW()
        WHERE id = $3 AND org_id = $4
        """,
        eligibility_status,
        json.dumps(_safe_json(summary)),
        order_id,
        org_id,
    )
    await _record_workflow_event(
        conn,
        org_id,
        "eligibility.checked",
        {"order_id": order_id, "eligibility_status": eligibility_status, "summary": _safe_json(summary)},
        order_id=order_id,
    )
    return {
        "eligibility_status": eligibility_status,
        "summary": _safe_json(summary),
        "assigned_to": context.get("assigned_to"),
        "assigned_to_user_id": context.get("assigned_to"),
        "assigned_email": context.get("assigned_email"),
        "patient_name": f"{context.get('first_name', '')} {context.get('last_name', '')}".strip(),
    }


async def _request_swo_signature(
    conn,
    org_id: str,
    order_id: str,
    physician_email: str | None = None,
    physician_name: str | None = None,
) -> dict[str, Any]:
    context = await _fetch_order_context(conn, org_id, order_id)
    if not context:
        raise HTTPException(status_code=404, detail="Order not found")

    patient_name = f"{context.get('first_name', '')} {context.get('last_name', '')}".strip() or "Unknown Patient"
    hcpcs_codes = _coerce_json_list(context.get("hcpcs_codes"))
    request_id = f"swo-{order_id}"
    sign_url = None
    provider_email = physician_email or _normalize_text(context.get("intake_payload", {}).get("physician_email") if isinstance(context.get("intake_payload"), dict) else "")

    if settings.dropbox_sign_request_url and settings.dropbox_sign_api_key:
        payload = {
            "order_id": order_id,
            "request_id": request_id,
            "patient_name": patient_name,
            "physician_email": provider_email,
            "physician_name": physician_name,
            "hcpcs_codes": hcpcs_codes,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                settings.dropbox_sign_request_url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.dropbox_sign_api_key}",
                    "Content-Type": "application/json",
                },
            )
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Dropbox Sign request failed: {response.status_code}")
        response_json = response.json()
        request_id = str(response_json.get("request_id") or response_json.get("signature_request_id") or request_id)
        sign_url = response_json.get("sign_url") or response_json.get("embedded_sign_url")

    await exec_write(
        conn,
        """
        UPDATE orders
        SET swo_status = 'requested', swo_request_id = $1, swo_sign_url = $2, updated_at = NOW()
        WHERE id = $3 AND org_id = $4
        """,
        request_id,
        sign_url,
        order_id,
        org_id,
    )
    await _record_workflow_event(
        conn,
        org_id,
        "swo.requested",
        {
            "order_id": order_id,
            "request_id": request_id,
            "sign_url": sign_url,
            "physician_email": provider_email,
            "physician_name": physician_name,
        },
        order_id=order_id,
    )
    return {"request_id": request_id, "sign_url": sign_url, "physician_email": provider_email}


async def _mark_billing_ready(
    conn,
    org_id: str,
    order_id: str,
    reason: str,
) -> None:
    context = await _fetch_order_context(conn, org_id, order_id)
    if not context:
        raise HTTPException(status_code=404, detail="Order not found")

    await exec_write(
        conn,
        """
        UPDATE orders
        SET billing_status = 'ready_for_scrub',
            billing_ready_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND org_id = $2
        """,
        order_id,
        org_id,
    )
    await _record_workflow_event(
        conn,
        org_id,
        "billing.ready_for_scrub",
        {"order_id": order_id, "reason": reason},
        order_id=order_id,
    )
    await _create_notification(
        conn,
        org_id,
        "billing_ready",
        "Billing ready for human scrub",
        "Claim package is ready for billing review before submission.",
        {"order_id": order_id, "reason": reason},
        user_id=context.get("assigned_to"),
        order_id=order_id,
    )


async def _schedule_pod_after_delivery(
    conn,
    org_id: str,
    order_id: str,
) -> None:
    context = await _fetch_order_context(conn, org_id, order_id)
    if not context:
        raise HTTPException(status_code=404, detail="Order not found")

    patient_email = _normalize_text(context.get("patient_email"))
    await exec_write(
        conn,
        """
        UPDATE orders
        SET pod_status = 'scheduled',
            pod_sent_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND org_id = $2
        """,
        order_id,
        org_id,
    )
    await _record_workflow_event(
        conn,
        org_id,
        "pod.scheduled",
        {"order_id": order_id, "patient_email": patient_email},
        order_id=order_id,
    )
    await _create_notification(
        conn,
        org_id,
        "pod_scheduled",
        "POD queued for patient",
        f"Delivery confirmed. POD outreach has been scheduled for {patient_email or 'the patient record with no email on file'}.",
        {"order_id": order_id, "patient_email": patient_email},
        user_id=context.get("assigned_to"),
        order_id=order_id,
    )


def _validate_status_transition(order: dict[str, Any], new_status: OrderStatus) -> str | None:
    current_status = _normalize_text(order.get("status")).lower()
    eligibility_status = _normalize_text(order.get("eligibility_status")).lower()
    swo_status = _normalize_text(order.get("swo_status")).lower()
    paid_amount = float(order.get("paid_amount") or 0)
    payment_date = order.get("payment_date")
    denial_category = _normalize_text(order.get("denial_category")).lower()

    if new_status in {OrderStatus.AUTHORIZED, OrderStatus.SUBMITTED}:
        if swo_status != "ingested":
            return "SWO must be created, sent, and returned before this order can move out of intake."

    if new_status == OrderStatus.SUBMITTED and current_status not in {"authorized", "submitted"}:
        return "Order must be authorized before it can be submitted."

    if new_status == OrderStatus.PAID and paid_amount <= 0 and not payment_date:
        return "An order cannot move to paid until a payment outcome is recorded."

    if new_status == OrderStatus.APPEALED and current_status != "denied" and not denial_category:
        return "Only denied orders can move to appealed."

    return None


async def _resolve_payer_id(conn, payer_id: str | None, payer_name: str | None) -> str:
    normalized_id = _safe_slug(_normalize_text(payer_id))
    if normalized_id:
        row = await fetch_one(conn, "SELECT id FROM payers WHERE id = $1 AND active = true", normalized_id)
        if row:
            return str(row["id"])

    normalized_name = _normalize_text(payer_name)
    if normalized_name:
        row = await fetch_one(
            conn,
            "SELECT id FROM payers WHERE lower(name) = lower($1) AND active = true",
            normalized_name,
        )
        if row:
            return str(row["id"])
        row = await fetch_one(
            conn,
            "SELECT id FROM payers WHERE replace(lower(name), ' ', '') = replace(lower($1), ' ', '') AND active = true",
            normalized_name,
        )
        if row:
            return str(row["id"])

    alias_map = {
        "MEDICARE": "MEDICARE_DMERC",
        "MEDICAREDMERC": "MEDICARE_DMERC",
        "MEDICARE_DMERC": "MEDICARE_DMERC",
        "UNITEDHEALTHCARE": "UHC",
        "UNITED_HEALTHCARE": "UHC",
        "BCBS": "BCBS",
        "BLUECROSSBLUESHIELD": "BCBS",
        "BLUE_CROSS_BLUE_SHIELD": "BCBS",
    }
    for candidate in (_safe_slug(normalized_name), normalized_id):
        mapped = alias_map.get(candidate)
        if mapped:
            return mapped
    return "UHC"


async def _fetch_availity_payer_edi(conn, internal_payer_id: str) -> tuple[str, str]:
    """
    Resolve X12 NM1*PR fields: payer name (NM103) and PI identifier (NM109) for Availity / clearinghouse.
    Falls back to internal payer id when no row or columns are unset.
    """
    raw = _normalize_text(internal_payer_id)
    if not raw:
        return "", ""
    row = await fetch_one(
        conn,
        """
        SELECT
            COALESCE(NULLIF(btrim(availity_payer_name), ''), name) AS edi_name,
            COALESCE(NULLIF(btrim(availity_payer_id), ''), id) AS edi_pi
        FROM payers
        WHERE id = $1 AND active = true
        """,
        raw,
    )
    if not row:
        return raw, raw
    edi_name = _normalize_text(row.get("edi_name")) or raw
    edi_pi = _normalize_text(row.get("edi_pi")) or raw
    return edi_name, edi_pi


def _split_patient_name(patient_name: str, first_name: str | None, last_name: str | None) -> tuple[str, str]:
    first = _normalize_text(first_name)
    last = _normalize_text(last_name)
    if first or last:
        return first or "Unknown", last or "Patient"
    parts = [part for part in _normalize_text(patient_name).split() if part]
    if not parts:
        return "Unknown", "Patient"
    if len(parts) == 1:
        return parts[0], "Patient"
    return parts[0], " ".join(parts[1:])


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class UserRole(str, Enum):
    ADMIN = "admin"
    BILLING = "billing"
    INTAKE = "intake"
    REP = "rep"
    EXECUTIVE = "executive"
    SYSTEM = "system"


ROLE_PERMISSION_MATRIX: dict[str, list[str]] = {
    "admin": [
        "manage_users",
        "reset_passwords",
        "view_all_orders",
        "view_patients",
        "create_patients",
        "update_patients",
        "create_orders",
        "assign_orders",
        "update_order_status",
        "manage_documents",
        "manage_fulfillment",
        "manage_denials",
        "record_payments",
        "submit_claims",
        "run_eligibility",
        "request_signatures",
        "view_analytics",
        "communicate",
    ],
    "executive": ["view_all_orders", "view_patients", "view_analytics", "view_denials", "view_ml_forecast", "communicate"],
    "billing": [
        "view_all_orders",
        "view_patients",
        "create_orders",
        "assign_orders",
        "update_order_status",
        "submit_claims",
        "record_payments",
        "manage_denials",
        "manage_documents",
        "manage_fulfillment",
        "run_eligibility",
        "view_analytics",
        "communicate",
    ],
    "intake": [
        "view_all_orders",
        "view_patients",
        "create_patients",
        "update_patients",
        "create_orders",
        "assign_orders",
        "run_eligibility",
        "request_signatures",
        "manage_documents",
        "communicate",
    ],
    "rep": [
        "view_all_orders",
        "view_patients",
        "create_orders",
        "assign_orders",
        "update_order_status",
        "manage_documents",
        "manage_fulfillment",
        "communicate",
    ],
    "system": ["service_integrations", "automation", "webhooks"],
}


class OrderStatus(str, Enum):
    DRAFT = "draft"
    PENDING_AUTH = "pending_auth"
    AUTHORIZED = "authorized"
    SUBMITTED = "submitted"
    PAID = "paid"
    DENIED = "denied"
    APPEALED = "appealed"
    WRITE_OFF = "write_off"
    CLOSED = "closed"


class DenialCategory(str, Enum):
    ELIGIBILITY = "eligibility"
    MEDICAL_NECESSITY = "medical_necessity"
    AUTHORIZATION = "authorization"
    CODING = "coding"
    TIMELY_FILING = "timely_filing"
    DUPLICATE = "duplicate"
    COORDINATION = "coordination"
    OTHER = "other"


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _normalize_login_email(email: str) -> str:
    """Lowercase + trim so login matches Postgres rows regardless of stored email casing."""
    return (email or "").strip().lower()


def verify_password(pw: str, stored_hash: str) -> bool:
    if not stored_hash:
        return False
    if stored_hash.startswith("$2"):
        try:
            return bcrypt.checkpw(pw.encode("utf-8"), stored_hash.encode("utf-8"))
        except Exception:
            return False
    return hashlib.sha256(pw.encode()).hexdigest() == stored_hash


def password_hash_needs_upgrade(stored_hash: str) -> bool:
    return bool(stored_hash) and not stored_hash.startswith("$2")


def _normalize_permission_state(value: Any) -> dict[str, list[str]]:
    base = value if isinstance(value, dict) else {}
    grant = sorted({str(item).strip() for item in _coerce_json_list(base.get("grant")) if str(item).strip()})
    deny = sorted({str(item).strip() for item in _coerce_json_list(base.get("deny")) if str(item).strip()})
    return {"grant": grant, "deny": deny}


def _all_permissions() -> list[str]:
    items: set[str] = set()
    for permissions in ROLE_PERMISSION_MATRIX.values():
        items.update(permissions)
    return sorted(items)


def _effective_permissions(role: str, permission_state: Any = None) -> list[str]:
    normalized = _normalize_permission_state(permission_state)
    effective = set(ROLE_PERMISSION_MATRIX.get((role or "").lower(), []))
    effective.update(normalized["grant"])
    effective.difference_update(normalized["deny"])
    return sorted(effective)


def create_token(user_id: str, role: str, org_id: str, permissions: list[str] | None = None) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "org_id": org_id,
        "permissions": permissions or [],
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    return decode_token(creds.credentials)


def require_roles(*roles: UserRole):
    async def _check(user: dict = Depends(current_user)):
        if user.get("role") not in [r.value for r in roles]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _check


def require_permissions(*permissions: str):
    async def _check(user: dict = Depends(current_user)):
        if user.get("role") == UserRole.ADMIN.value:
            return user
        granted = set(_coerce_json_list(user.get("permissions")))
        missing = [permission for permission in permissions if permission not in granted]
        if missing:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _check


def require_any_permission(*permissions: str):
    """User must have at least one of the listed permissions (admin always allowed)."""

    async def _check(user: dict = Depends(current_user)):
        if user.get("role") == UserRole.ADMIN.value:
            return user
        granted = set(_coerce_json_list(user.get("permissions")))
        if any(p in granted for p in permissions):
            return user
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    return _check


def require_internal_api_key():
    async def _check(request: Request):
        expected_key = settings.internal_api_key
        if not expected_key:
            raise HTTPException(status_code=503, detail="Internal service key is not configured")
        provided_key = request.headers.get("X-Internal-API-Key", "").strip()
        if provided_key != expected_key:
            raise HTTPException(status_code=401, detail="Invalid internal service key")
        return True
    return _check


@app.get("/internal/orders/{order_id}/claim-authority")
async def internal_order_claim_authority(
    order_id: str,
    request: Request,
    _: bool = Depends(require_internal_api_key()),
):
    """EDI (and other services) verify claim_strategy before submitting claims."""
    db = request.app.state.db_pool
    async with db.connection() as conn:
        row = await fetch_one(
            conn,
            "SELECT id, org_id, claim_strategy FROM orders WHERE id = $1",
            order_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    return {
        "order_id": str(row["id"]),
        "org_id": str(row["org_id"]),
        "claim_strategy": row.get("claim_strategy"),
    }


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: UserRole
    first_name: str | None = None
    last_name: str | None = None
    rep_id: str | None = None
    permissions_grant: list[str] = []
    permissions_deny: list[str] = []


class UserPasswordUpdate(BaseModel):
    password: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


class AdminUserUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    role: UserRole | None = None
    territory_id: str | None = None
    is_active: bool | None = None
    permissions_grant: list[str] | None = None
    permissions_deny: list[str] | None = None


class FaxLogEntryPayload(BaseModel):
    direction: str = "outbound"
    fax_number: str
    facility: str | None = None
    patient_name: str | None = None
    patient_dob: str | None = None
    patient_mrn: str | None = None
    patient_id: str | None = None
    order_id: str | None = None
    record_types: list[str] = []
    urgency: str | None = None
    status: str = "queued"
    pages: int = 0
    service: str | None = None
    sinch_fax_id: str | None = None
    sent_by: str | None = None
    file_url: str | None = None
    received_at: str | None = None
    related_fax_id: str | None = None
    review_status: str | None = None
    review_reason: str | None = None
    release_metadata: dict[str, Any] = {}
    raw_webhook: dict[str, Any] = {}
    external_fax_id: str | None = None
    document_hash: str | None = None
    # Pipeline: received | intake_incomplete | processed | case_created (inbound); optional override
    intake_status: str | None = None


class FaxReviewPayload(BaseModel):
    patient_id: str | None = None
    order_id: str | None = None
    review_status: str = "reviewed"
    review_reason: str | None = None


class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    dob: str  # ISO date
    email: EmailStr | None = None
    insurance_id: str | None = None
    payer_id: str | None = None
    diagnosis_codes: list[str] = []
    phone: str | None = None
    address: dict | None = None

    @field_validator("diagnosis_codes")
    @classmethod
    def validate_icd10(cls, v):
        for code in v:
            if not (3 <= len(code) <= 7):
                raise ValueError(f"Invalid ICD-10 format: {code}")
        return [c.upper() for c in v]


class PatientUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    dob: str | None = None
    email: EmailStr | None = None
    insurance_id: str | None = None
    payer_id: str | None = None
    diagnosis_codes: list[str] | None = None
    phone: str | None = None
    address: dict | None = None


class OrderCreate(BaseModel):
    patient_id: str
    hcpcs_codes: list[str] = []
    referring_physician_npi: str | None = None
    payer_id: str
    insurance_auth_number: str | None = None
    notes: str | None = None
    priority: str = "standard"  # standard | urgent | stat
    assigned_to: str | None = None
    source_channel: str | None = "manual"
    source_reference: str | None = None
    intake_payload: dict[str, Any] | None = None
    vertical: str | None = None
    product_category: str | None = None
    source: str | None = None


class DenialCreate(BaseModel):
    order_id: str
    carc_code: str
    rarc_code: str | None = None
    denial_category: DenialCategory
    denial_date: str
    denied_amount: float
    payer_claim_number: str | None = None
    notes: str | None = None


class PaymentOutcome(BaseModel):
    order_id: str
    paid_amount: float
    payment_date: str
    eob_reference: str | None = None
    adjustment_codes: list[str] = []


class Eligibility270Request(BaseModel):
    """Raw X12 270 envelope, for direct Availity passthrough."""

    edi_270: str
    correlation_id: str | None = None
    patient_id: str | None = None
    order_id: str | None = None
    payer_id: str | None = None


class EligibilityFromOrderRequest(BaseModel):
    """Build a basic 270 from Poseidon patient/order records."""

    patient_id: str
    order_id: str | None = None
    service_date: str | None = None  # YYYYMMDD; defaults to today


class EligibilitySimpleRequest(BaseModel):
    """UI-friendly eligibility check that does not require X12 knowledge."""

    member_id: str
    payer_id: str
    first_name: str
    last_name: str
    dob: str  # YYYY-MM-DD
    service_date: str | None = None  # YYYYMMDD; defaults to today
    provider_npi: str | None = None


class ClaimSubmitRequest(BaseModel):
    """Raw 837 submission to Availity."""

    edi_837: str
    claim_type: str = "professional"  # professional | institutional | dental
    correlation_id: str | None = None
    order_id: str | None = None
    payer_id: str | None = None


class ClaimFromOrderRequest(BaseModel):
    """Build a minimal 837 P from patient/order and submit to Availity."""

    order_id: str
    service_date: str | None = None  # YYYYMMDD; defaults to today


class ImportOrderPayload(BaseModel):
    patient_name: str
    first_name: str | None = None
    last_name: str | None = None
    dob: str | None = None
    email: EmailStr | None = None
    insurance_id: str | None = None
    payer: str | None = None
    payer_id: str | None = None
    hcpcs: str | None = None
    hcpcs_codes: list[str] | None = None
    npi: str | None = None
    referring_physician_npi: str | None = None
    icd: str | None = None
    diagnosis_codes: list[str] | None = None
    priority: str | None = None
    notes: str | None = None
    assigned_to: str | None = None
    assigned_to_email: str | None = None
    source_channel: str | None = None
    source_reference: str | None = None
    intake_payload: dict[str, Any] | None = None
    # LVCO / spreadsheet remittance snapshot (optional)
    paid_amount: float | None = None
    reimbursed_amount: float | None = None
    denied_amount: float | None = None
    billed_amount: float | None = None
    claim_status: str | None = None


class OrderAssignmentRequest(BaseModel):
    assigned_to: str | None = None
    assigned_to_email: str | None = None


class IntakeWorkflowRequest(BaseModel):
    auto_request_swo: bool = True


class SwoRequestPayload(BaseModel):
    physician_email: EmailStr | None = None
    physician_name: str | None = None


class SwoWebhookPayload(BaseModel):
    order_id: str
    signature_request_id: str | None = None
    swo_document_id: str | None = None
    signed_items: list[str] = []
    account_manager_email: EmailStr | None = None
    event_type: str = "signature_complete"
    signed_at: str | None = None


class FulfillmentUpdatePayload(BaseModel):
    tracking_number: str
    tracking_carrier: str | None = None
    tracking_status: str | None = "shipped"
    tracking_url: str | None = None
    invoice_document_id: str | None = None
    packing_sheet_document_id: str | None = None


class TrackingWebhookPayload(BaseModel):
    order_id: str
    tracking_number: str
    tracking_status: str
    delivered_at: str | None = None
    carrier: str | None = None
    tracking_url: str | None = None


class PodReceiptPayload(BaseModel):
    pod_document_id: str | None = None
    received_at: str | None = None


class BillingReviewPayload(BaseModel):
    reviewer_notes: str | None = None
    route: str = "api"  # api | third_party


class CommunicationMessagePayload(BaseModel):
    message: str
    channel: str = "ops"
    order_id: str | None = None
    message_type: str = "note"
    metadata: dict[str, Any] | None = None


class OrdersImportRequest(BaseModel):
    orders: list[ImportOrderPayload]


class PatientNoteCreate(BaseModel):
    content: str


class PatientAssignRepRequest(BaseModel):
    rep_id: str


class CodingRecommendationRequest(BaseModel):
    payer_id: str
    icd10_codes: list[str]
    physician_npi: str | None = None
    limit: int = 5

    @field_validator("payer_id")
    @classmethod
    def validate_payer_id(cls, value: str) -> str:
        normalized = _normalize_text(value).upper()
        if not normalized:
            raise ValueError("payer_id is required")
        return normalized

    @field_validator("icd10_codes")
    @classmethod
    def validate_icd10_codes(cls, values: list[str]) -> list[str]:
        out: list[str] = []
        for value in values:
            code = _normalize_text(value).upper()
            if code:
                out.append(code)
        if not out:
            raise ValueError("At least one ICD-10 code is required")
        return out

    @field_validator("physician_npi")
    @classmethod
    def validate_npi(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = _normalize_text(value)
        if not normalized:
            return None
        if not re.fullmatch(r"\d{10}", normalized):
            raise ValueError("physician_npi must be 10 digits")
        return normalized

    @field_validator("limit")
    @classmethod
    def validate_limit(cls, value: int) -> int:
        return max(1, min(value, 10))


def _import_stable_insurance_id(
    row: ImportOrderPayload,
    first_name: str,
    last_name: str,
    dob: str,
) -> str:
    """Use explicit member id when present; otherwise a stable synthetic id from name+dob so duplicate spreadsheet rows match one patient."""
    explicit = _normalize_text(row.insurance_id)
    if explicit:
        return explicit
    basis = f"{first_name.lower()}|{last_name.lower()}|{dob}".encode("utf-8")
    digest = hashlib.sha256(basis).hexdigest()[:16]
    return f"IMPORT-ANON-{digest}"


def _import_resolve_hcpcs_and_diagnosis(row: ImportOrderPayload) -> tuple[list[str], list[str]]:
    """Normalized HCPCS (L-codes) and ICD diagnosis lists exactly as insert path uses (sorted for dedup keys)."""
    diagnosis_codes = [code.upper() for code in (row.diagnosis_codes or []) if _normalize_text(code)]
    if not diagnosis_codes and _normalize_text(row.icd):
        diagnosis_codes = [_normalize_text(row.icd).upper()]
    if not diagnosis_codes:
        diagnosis_codes = ["Z00.00"]
    hcpcs_codes = [code.upper() for code in (row.hcpcs_codes or []) if _normalize_text(code)]
    if not hcpcs_codes and _normalize_text(row.hcpcs):
        hcpcs_codes = [_normalize_text(row.hcpcs).upper()]
    if not hcpcs_codes:
        hcpcs_codes, inferred_from = _infer_hcpcs_from_diagnosis(diagnosis_codes)
        row.notes = f"{_normalize_text(row.notes)} [hcpcs_inferred_from_icd10:{inferred_from}]".strip()
        logger.warning(
            "Import row missing HCPCS; inferred %s from ICD-10 context %s",
            ",".join(hcpcs_codes),
            inferred_from,
        )
    return sorted(hcpcs_codes), sorted(diagnosis_codes)


ICD10_TO_HCPCS_CONTEXT: tuple[tuple[tuple[str, ...], list[str], str], ...] = (
    (("M17", "M23", "M25.56", "M25.57"), ["L1833"], "knee-bracing"),
    (("M16", "M24.45", "M25.55"), ["L1686"], "hip-bracing"),
    (("G82", "G80", "G35", "R26"), ["K0823"], "mobility"),
    (("M54", "M51", "M48"), ["L0650"], "lumbar-bracing"),
)


def _infer_hcpcs_from_diagnosis(diagnosis_codes: list[str]) -> tuple[list[str], str]:
    normalized = [str(code or "").upper() for code in diagnosis_codes if str(code or "").strip()]
    for prefixes, hcpcs_codes, source in ICD10_TO_HCPCS_CONTEXT:
        for code in normalized:
            if any(code.startswith(prefix) for prefix in prefixes):
                return list(hcpcs_codes), source
    # Use brace-first fallback for production DME defaults.
    return ["L1833"], "fallback-default-knee-bracing"


async def _import_row_dedup_context(
    conn: Any,
    org_id: str,
    row: ImportOrderPayload,
) -> tuple[tuple[Any, ...], tuple[str, str, str, str, str, list[str], list[str]]]:
    """
    Build dedup key: org + patient identity + payer + ICD set + HCPCS set.
    Returns (key, (first_name, last_name, dob, insurance_id, payer_id, hcpcs_codes, diagnosis_codes)).
    """
    first_name, last_name = _split_patient_name(row.patient_name, row.first_name, row.last_name)
    dob = _normalize_date_string(row.dob)
    insurance_id = _import_stable_insurance_id(row, first_name, last_name, dob)
    payer_id = await _resolve_payer_id(conn, row.payer_id, row.payer)
    hcpcs_codes, diagnosis_codes = _import_resolve_hcpcs_and_diagnosis(row)
    key = (
        org_id,
        (first_name or "").lower(),
        (last_name or "").lower(),
        dob,
        insurance_id.lower(),
        payer_id,
        tuple(diagnosis_codes),
        tuple(hcpcs_codes),
    )
    ctx = (first_name, last_name, dob, insurance_id, payer_id, hcpcs_codes, diagnosis_codes)
    return key, ctx


async def _import_find_existing_draft_duplicate(
    conn: Any,
    org_id: str,
    patient_id: str,
    payer_id: str,
    hcpcs_codes: list[str],
    diagnosis_codes: list[str],
) -> dict[str, Any] | None:
    """
    Same import run dedupes in-memory; across API calls we must not insert another draft
    import order for the same org/patient/payer/HCPCS/diagnosis signature.
    """
    hcpcs_norm = json.dumps(hcpcs_codes)
    diag_norm = json.dumps(diagnosis_codes)
    return await fetch_one(
        conn,
        """
        SELECT o.id, o.notes
        FROM orders o
        WHERE o.org_id = $1::uuid
          AND o.patient_id = $2::uuid
          AND o.payer_id = $3
          AND o.status = 'draft'
          AND lower(btrim(coalesce(o.source_channel, ''))) IN ('import', 'lvco')
          AND COALESCE(
            (
              SELECT jsonb_agg(elem ORDER BY elem)
              FROM jsonb_array_elements_text(COALESCE(o.hcpcs_codes, '[]'::jsonb)) AS e(elem)
            ),
            '[]'::jsonb
          ) = $4::jsonb
          AND (
            (o.intake_payload ? '_import_diag_sig'
              AND (o.intake_payload->'_import_diag_sig')::jsonb = $5::jsonb)
            OR (
              NOT (o.intake_payload ? '_import_diag_sig')
              AND EXISTS (
                SELECT 1 FROM patients p
                WHERE p.id = o.patient_id
                  AND p.diagnosis_codes IS NOT NULL
                  AND p.diagnosis_codes = $6::jsonb
              )
            )
          )
        ORDER BY o.created_at ASC NULLS FIRST, o.id
        LIMIT 1
        """,
        org_id,
        patient_id,
        payer_id,
        hcpcs_norm,
        diag_norm,
        diag_norm,
    )


def _coerce_import_money(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        v = float(value)
        return v
    s = _normalize_text(str(value)).replace("$", "").replace(",", "").replace("(", "-").replace(")", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _import_infer_order_status_from_lvco(
    paid: float | None,
    denied: float | None,
    claim_status: str,
) -> str | None:
    """Return a Core order status when LVCO data is explicit enough; else None."""
    cs = claim_status.lower()
    if paid is not None and paid > 0 and (denied is None or denied <= 0):
        return "paid"
    if denied is not None and denied > 0:
        return "denied"
    if "paid" in cs or "remit" in cs or "allow" in cs:
        if "deny" not in cs:
            return "paid"
    if "deny" in cs or "reject" in cs:
        return "denied"
    if "pend" in cs or "process" in cs or "review" in cs:
        return "submitted"
    return None


async def _import_apply_financial_snapshot(
    conn: Any,
    org_id: str,
    user_sub: str,
    order_id: str,
    payer_id: str,
    row: ImportOrderPayload,
    hcpcs_codes: list[str],
    diagnosis_codes: list[str],
) -> None:
    """
    Persist LVCO / spreadsheet paid & denied amounts on the order row, payment_outcomes,
    and denials so patient charts and Kanban show real reimbursement posture.
    """
    paid = _coerce_import_money(row.reimbursed_amount) or _coerce_import_money(row.paid_amount)
    denied = _coerce_import_money(row.denied_amount)
    billed = _coerce_import_money(row.billed_amount)
    claim_st = _normalize_text(row.claim_status)
    inferred = _import_infer_order_status_from_lvco(paid, denied, claim_st)

    if paid is None and denied is None and billed is None and not claim_st:
        return

    hcpcs_primary = hcpcs_codes[0] if hcpcs_codes else None
    diag_text = json.dumps(diagnosis_codes)
    claim_ref = f"LVCO-{order_id}"

    billing_status = None
    if paid is not None and paid > 0 and (denied is None or denied <= 0):
        billing_status = "paid"
    elif denied is not None and denied > 0:
        billing_status = "denied"
    elif billed is not None and billed > 0:
        billing_status = "billed"

    await exec_write(
        conn,
        """
        UPDATE orders
        SET
            total_billed = COALESCE($1::numeric, total_billed),
            paid_amount = COALESCE($2::numeric, paid_amount),
            total_paid = COALESCE($3::numeric, total_paid),
            denied_amount = COALESCE($4::numeric, denied_amount),
            payment_date = CASE WHEN $5::numeric IS NOT NULL AND $6::numeric > 0 THEN COALESCE(payment_date, CURRENT_DATE) ELSE payment_date END,
            denial_date = CASE WHEN $7::numeric IS NOT NULL AND $8::numeric > 0 THEN COALESCE(denial_date, CURRENT_DATE) ELSE denial_date END,
            status = COALESCE($9::text, status),
            billing_status = COALESCE($10::text, billing_status),
            updated_at = NOW()
        WHERE id = $11::uuid AND org_id = $12::uuid
        """,
        billed,
        paid,
        paid,
        denied,
        paid,
        paid,
        denied,
        denied,
        inferred,
        billing_status,
        order_id,
        org_id,
    )

    await exec_write(
        conn,
        "DELETE FROM payment_outcomes WHERE order_id = $1::uuid AND eob_reference = 'lvco_import'",
        order_id,
    )
    await exec_write(
        conn,
        "DELETE FROM denials WHERE order_id = $1::uuid AND COALESCE(notes, '') LIKE '[lvco_import]%%'",
        order_id,
    )

    if paid is not None and paid > 0:
        pid = str(uuid.uuid4())
        await exec_write(
            conn,
            """
            INSERT INTO payment_outcomes (
                id, org_id, order_id, claim_number, payer_id, hcpcs_code, diagnosis_codes,
                billed_amount, paid_amount, is_denial, payment_date, eob_reference, created_by
            )
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::numeric, $9::numeric, false, CURRENT_DATE, 'lvco_import', $10::uuid)
            """,
            pid,
            org_id,
            order_id,
            claim_ref,
            payer_id,
            hcpcs_primary,
            diag_text,
            billed,
            paid,
            user_sub,
        )

    if denied is not None and denied > 0:
        did = str(uuid.uuid4())
        await exec_write(
            conn,
            """
            INSERT INTO denials (
                id, org_id, order_id, payer_id, denied_amount, denial_date,
                denial_category, denial_reason, status, notes, created_by
            )
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::numeric, CURRENT_DATE,
                'LVCO Import', $6, 'new', '[lvco_import] snapshot from spreadsheet', $7::uuid)
            """,
            did,
            org_id,
            order_id,
            payer_id,
            denied,
            claim_st or "Recorded from LVCO ingest",
            user_sub,
        )


# ---------------------------------------------------------------------------
# Auth Routes
# ---------------------------------------------------------------------------

@app.post("/auth/login")
async def login(payload: LoginRequest, request: Request):
    db = request.app.state.db_pool
    matched_legacy_hash = False
    email_key = _normalize_login_email(str(payload.email))
    async with db.connection() as conn:
        row = await fetch_one(
            conn,
            "SELECT id, role, org_id, password_hash, permissions FROM users "
            "WHERE LOWER(TRIM(email)) = $1 "
            "AND COALESCE(active, TRUE) IS TRUE "
            "AND COALESCE(is_active, TRUE) IS TRUE",
            email_key,
        )
        if not row or not verify_password(payload.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if password_hash_needs_upgrade(str(row["password_hash"])):
            matched_legacy_hash = True
            await exec_write(
                conn,
                "UPDATE users SET password_hash = $1 WHERE id = $2",
                hash_password(payload.password),
                row["id"],
            )
            await audit_log(
                conn,
                str(row["org_id"]),
                str(row["id"]),
                "password_hash_upgraded",
                "users",
                str(row["id"]),
                _client_ip(request),
            )

        effective_permissions = _effective_permissions(str(row["role"]), row.get("permissions"))

    if matched_legacy_hash:
        logger.info("Upgraded legacy password hash for user %s", row["id"])

    token = create_token(str(row["id"]), row["role"], str(row["org_id"]), effective_permissions)
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": row["role"],
        "org_id": str(row["org_id"]),
        "user_id": str(row["id"]),
        "permissions": effective_permissions,
    }


# ---------------------------------------------------------------------------
# Password Reset
# ---------------------------------------------------------------------------

def _generate_reset_token() -> tuple[str, str]:
    """Generate a random reset token and its SHA-256 hash for DB storage."""
    raw = uuid.uuid4().hex + uuid.uuid4().hex  # 64 hex chars
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    return raw, token_hash


@app.post("/auth/request-reset")
async def request_password_reset(payload: PasswordResetRequest, request: Request):
    """
    Request a password reset link. Always returns 200 to prevent email enumeration.
    If SMTP is configured, emails the link. Otherwise, the token is logged (admin retrieval).
    """
    db = request.app.state.db_pool
    async with db.connection() as conn:
        row = await fetch_one(
            conn,
            "SELECT id, org_id, email FROM users WHERE email = $1 AND active = true",
            payload.email,
        )
        if not row:
            # Don't reveal whether email exists
            return {"status": "ok", "message": "If that email is registered, a reset link has been sent."}

        # Invalidate any existing unused tokens for this user
        await exec_write(
            conn,
            "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
            row["id"],
        )

        raw_token, token_hash = _generate_reset_token()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

        await exec_write(
            conn,
            """
            INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
            VALUES ($1, $2, $3)
            """,
            row["id"], token_hash, expires_at,
        )

        await audit_log(
            conn, str(row["org_id"]), str(row["id"]),
            "password_reset_requested", "users", str(row["id"]),
            _client_ip(request),
        )

    # Build reset URL
    base_url = os.getenv("NEXTAUTH_URL", "").strip()
    if not base_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password reset is not configured.",
        )
    reset_url = f"{base_url}/login?reset_token={raw_token}"

    # Try to send email if SMTP is configured
    email_sent = False
    if settings.smtp_host and settings.smtp_user and settings.smtp_password:
        try:
            import smtplib
            from email.mime.text import MIMEText

            msg = MIMEText(
                f"You requested a password reset for your Poseidon account.\n\n"
                f"Click this link to reset your password (expires in 1 hour):\n"
                f"{reset_url}\n\n"
                f"If you did not request this, ignore this email.\n",
                "plain",
            )
            msg["Subject"] = "Poseidon — Password Reset"
            msg["From"] = settings.email_from_address or settings.smtp_user
            msg["To"] = payload.email

            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(msg["From"], [payload.email], msg.as_string())
            email_sent = True
            logger.info("Password reset email sent to %s", payload.email)
        except Exception as e:
            logger.error("Failed to send reset email: %s", e)

    if not email_sent:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password reset delivery is not configured.",
        )

    return {
        "status": "ok",
        "message": "If that email is registered, a reset link has been sent.",
        # Only include token in response when SMTP is not configured (dev/local mode)
        **({"reset_token": raw_token, "reset_url": reset_url} if not (settings.smtp_host and settings.smtp_user) else {}),
    }


@app.post("/auth/reset-password")
async def reset_password(payload: PasswordResetConfirm, request: Request):
    """Consume a reset token and set a new password."""
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()

    db = request.app.state.db_pool
    async with db.connection() as conn:
        row = await fetch_one(
            conn,
            """
            SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at, u.org_id
            FROM password_reset_tokens prt
            JOIN users u ON u.id = prt.user_id
            WHERE prt.token_hash = $1
            """,
            token_hash,
        )

        if not row:
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")
        if row["used_at"]:
            raise HTTPException(status_code=400, detail="This reset token has already been used")
        if row["expires_at"] < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="This reset token has expired")

        # Update password
        await exec_write(
            conn,
            "UPDATE users SET password_hash = $1 WHERE id = $2",
            hash_password(payload.new_password), row["user_id"],
        )

        # Mark token as used
        await exec_write(
            conn,
            "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1",
            row["id"],
        )

        await audit_log(
            conn, str(row["org_id"]), str(row["user_id"]),
            "password_reset_completed", "users", str(row["user_id"]),
            _client_ip(request),
        )

    return {"status": "ok", "message": "Password has been reset. You can now log in."}


@app.get("/users")
async def list_users(
    request: Request,
    user: dict = Depends(require_permissions("manage_users")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        rows = await fetch_all(
            conn,
            """
            SELECT id, email, first_name, last_name, role,
                   COALESCE(is_active, active, true) AS active,
                   territory_id, permissions,
                   created_at
            FROM users
            WHERE org_id = $1
            ORDER BY created_at DESC, email ASC
            """,
            user["org_id"],
        )

    return {
        "users": [
            {
                **dict(row),
                "status": "active" if row["active"] else "inactive",
                "rep_id": None,
                "permissions_override": _normalize_permission_state(row.get("permissions")),
                "effective_permissions": _effective_permissions(str(row["role"]), row.get("permissions")),
            }
            for row in rows
        ]
    }


@app.post("/users", status_code=201)
async def create_user(
    payload: UserCreate,
    request: Request,
    user: dict = Depends(require_permissions("manage_users")),
):
    user_id = str(uuid.uuid4())
    db = request.app.state.db_pool

    async with db.connection() as conn:
        existing = await fetch_one(
            conn,
            "SELECT id FROM users WHERE email = $1",
            payload.email,
        )
        if existing:
            raise HTTPException(status_code=409, detail="User already exists")

        await exec_write(
            conn,
            """
            INSERT INTO users (id, org_id, email, password_hash, first_name, last_name, role, active, permissions)
            VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8::jsonb)
            """,
            user_id,
            user["org_id"],
            payload.email,
            hash_password(payload.password),
            payload.first_name,
            payload.last_name,
            payload.role.value,
            _json_dump({
                "grant": payload.permissions_grant,
                "deny": payload.permissions_deny,
            }),
        )

    return {
        "id": user_id,
        "email": payload.email,
        "role": payload.role.value,
        "status": "active",
        "rep_id": payload.rep_id,
        "permissions_override": {
            "grant": sorted(set(payload.permissions_grant)),
            "deny": sorted(set(payload.permissions_deny)),
        },
        "effective_permissions": _effective_permissions(
            payload.role.value,
            {"grant": payload.permissions_grant, "deny": payload.permissions_deny},
        ),
    }


@app.patch("/users/{user_id}/password")
async def update_user_password(
    user_id: str,
    payload: UserPasswordUpdate,
    request: Request,
    user: dict = Depends(require_permissions("reset_passwords")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        rowcount = await exec_write(
            conn,
            """
            UPDATE users
            SET password_hash = $1
            WHERE id = $2 AND org_id = $3
            """,
            hash_password(payload.password),
            user_id,
            user["org_id"],
        )

    if rowcount == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {"user_id": user_id, "status": "password_updated"}


# ---------------------------------------------------------------------------
# Patient Routes
# ---------------------------------------------------------------------------

@app.get("/fax/log")
async def get_fax_log(
    request: Request,
    user: dict = Depends(require_permissions("view_patients")),
    direction: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        await _require_fax_log(conn)
        params: list[Any] = [user["org_id"]]
        where = ["(org_id = $1 OR org_id IS NULL)"]
        if direction:
            params.append(direction)
            where.append(f"direction = ${len(params)}")
        params.extend([max(1, min(limit, 200)), max(offset, 0)])
        rows = await fetch_all(
            conn,
            f"""
            SELECT id, direction, fax_number, facility, patient_name, patient_dob, patient_mrn,
                   patient_id, order_id, related_fax_id, review_status, review_reason,
                   record_types, urgency, status, pages, service, sinch_fax_id, external_fax_id, document_hash, intake_status, sent_by, file_url,
                   received_at, release_metadata, raw_webhook, created_at
            FROM fax_log
            WHERE {' AND '.join(where)}
            ORDER BY created_at DESC
            LIMIT ${len(params) - 1} OFFSET ${len(params)}
            """,
            *params,
        )
        total_row = await fetch_one(
            conn,
            f"SELECT COUNT(*)::int AS total FROM fax_log WHERE {' AND '.join(where)}",
            *params[: len(params) - 2],
        )
    return {"entries": [_serialize(dict(row)) for row in rows], "total": int((total_row or {}).get("total") or 0)}


@app.post("/fax/log", status_code=201)
async def create_fax_log(
    payload: FaxLogEntryPayload,
    request: Request,
    user: dict = Depends(require_permissions("create_patients")),
):
    db = request.app.state.db_pool
    fax_id = str(uuid.uuid4())
    async with db.connection() as conn:
        await _require_fax_log(conn)
        context = await _resolve_fax_patient_context(conn, str(user["org_id"]), payload)
        await exec_write(
            conn,
            """
            INSERT INTO fax_log (
                id, org_id, direction, fax_number, facility, patient_name, patient_dob, patient_mrn,
                patient_id, order_id, related_fax_id, review_status, review_reason,
                record_types, urgency, status, pages, service, sinch_fax_id, intake_status, sent_by, file_url,
                received_at, release_metadata, raw_webhook
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24::jsonb,$25::jsonb)
            """,
            fax_id,
            user["org_id"],
            payload.direction,
            payload.fax_number,
            payload.facility,
            context["patient_name"],
            context["patient_dob"],
            context["patient_mrn"],
            context["patient_id"],
            context["order_id"],
            payload.related_fax_id,
            payload.review_status or ("linked_to_chart" if context["patient_id"] else "not_required"),
            payload.review_reason,
            json.dumps(payload.record_types or []),
            payload.urgency,
            payload.status,
            payload.pages,
            payload.service,
            payload.sinch_fax_id,
            _normalize_text(payload.intake_status)
            or ("received" if (payload.direction or "").lower() == "inbound" else "sent"),
            payload.sent_by or user.get("email") or user["sub"],
            payload.file_url,
            payload.received_at,
            json.dumps(payload.release_metadata or {}),
            json.dumps(payload.raw_webhook or {}),
        )
        await audit_log(conn, user["org_id"], user["sub"], "create", "fax_log", fax_id, _client_ip(request))
        row = await fetch_one(conn, "SELECT * FROM fax_log WHERE id = $1", fax_id)
    return _serialize(dict(row or {"id": fax_id}))


class InboundIntakeWork(NamedTuple):
    """State passed from create_intake_record() → process_intake() (context dict is mutated in process_intake)."""

    fax_id: str
    org_id: str | None
    matched_outbound: dict[str, Any] | None
    parsed_intake: dict[str, Any]
    context: dict[str, Any]
    ext_fax: str | None
    doc_hash: str | None
    intake_incomplete: bool
    conf: float | None
    review_status: str
    review_reason: str


async def create_intake_record(
    conn: Any,
    fax_id: str,
    payload: FaxLogEntryPayload,
) -> tuple[dict[str, Any] | None, InboundIntakeWork | None]:
    """
    Idempotency checks → enrich from outbound → OCR confidence → optional patient create →
    resolve context → INSERT fax_log. Returns (idempotent_response, None) or (None, work).
    """
    await _require_fax_log(conn)
    incoming_sinch_id = _normalize_text(payload.sinch_fax_id)
    ext_fax = _normalize_text(payload.external_fax_id) or None
    doc_hash = _normalize_document_hash(payload.document_hash)
    if incoming_sinch_id:
        existing = await fetch_one(
            conn,
            """
            SELECT id, org_id, patient_id, order_id, status, review_status, sinch_fax_id
            FROM fax_log
            WHERE direction = 'inbound'
              AND sinch_fax_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            """,
            incoming_sinch_id,
        )
        if existing:
            return {**dict(existing), "idempotent_replay": True}, None
    if ext_fax:
        existing = await fetch_one(
            conn,
            """
            SELECT id, org_id, patient_id, order_id, status, review_status, sinch_fax_id
            FROM fax_log
            WHERE direction = 'inbound'
              AND external_fax_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            """,
            ext_fax,
        )
        if existing:
            return {**dict(existing), "idempotent_replay": True}, None
    if doc_hash:
        existing = await fetch_one(
            conn,
            """
            SELECT id, org_id, patient_id, order_id, status, review_status, sinch_fax_id
            FROM fax_log
            WHERE direction = 'inbound'
              AND document_hash = $1
            ORDER BY created_at DESC
            LIMIT 1
            """,
            doc_hash,
        )
        if existing:
            return {**dict(existing), "idempotent_replay": True}, None

    matched_outbound = await _find_recent_outbound_fax(conn, payload.fax_number)
    org_id = str(matched_outbound["org_id"]) if matched_outbound and matched_outbound.get("org_id") else None
    if matched_outbound:
        if not payload.patient_name:
            payload.patient_name = _normalize_text(matched_outbound.get("patient_name")) or None
        if not payload.patient_dob:
            payload.patient_dob = _normalize_text(matched_outbound.get("patient_dob")) or None
        if not payload.patient_mrn:
            payload.patient_mrn = _normalize_text(matched_outbound.get("patient_mrn")) or None
        if not payload.patient_id:
            payload.patient_id = _normalize_text(matched_outbound.get("patient_id")) or None
        if not payload.order_id:
            payload.order_id = _normalize_text(matched_outbound.get("order_id")) or None

    parsed_intake = _parsed_intake_from_fax_payload(payload)
    raw_wh = payload.raw_webhook if isinstance(payload.raw_webhook, dict) else {}
    conf = _extract_intake_confidence(parsed_intake, raw_wh)
    ocr_threshold = min(1.0, max(0.0, float(settings.intake_ocr_confidence_threshold)))
    intake_incomplete = conf is not None and conf < ocr_threshold
    if intake_incomplete:
        rw = dict(raw_wh)
        rw["processing_state"] = "intake_incomplete"
        rw["intake_status"] = "intake_incomplete"
        rw["intake_confidence"] = conf
        rw["intake_confidence_threshold"] = ocr_threshold
        payload.raw_webhook = rw
        payload.review_status = "intake_incomplete"
        payload.review_reason = (
            f"OCR confidence {conf:.2f} is below threshold {ocr_threshold:.2f}. "
            "Patient was not auto-created. Review required."
        )

    fax_intake_status: str | None = None
    hold_reason: str | None = None
    if org_id and not payload.patient_id and not intake_incomplete:
        inferred_patient_id, fax_intake_status, hold_reason = await resolve_fax_patient_with_pipeline(
            conn,
            org_id,
            parsed_intake,
            payload_patient_dob=payload.patient_dob,
            payload_patient_name=payload.patient_name,
            payload_patient_mrn=payload.patient_mrn,
            intake_incomplete=intake_incomplete,
            fetch_one=fetch_one,
            fetch_all=fetch_all,
            exec_write=exec_write,
            record_workflow_event=_record_workflow_event,
            fax_sinch_id=payload.sinch_fax_id,
        )
        if inferred_patient_id:
            payload.patient_id = inferred_patient_id
            if not payload.patient_name:
                payload.patient_name = _normalize_text(parsed_intake.get("patient_name")) or None
            if not payload.patient_dob:
                payload.patient_dob = _normalize_text(parsed_intake.get("date_of_birth")) or None
    if hold_reason:
        payload.review_status = payload.review_status or "held_for_review"
        payload.review_reason = payload.review_reason or hold_reason

    context = await _resolve_fax_patient_context(conn, org_id, payload)
    if intake_incomplete:
        review_status = str(payload.review_status or "intake_incomplete")
        review_reason = str(payload.review_reason or "")
    else:
        review_status, review_reason = _inbound_review_state(
            payload.fax_number,
            org_id,
            context.get("patient_id"),
            matched_outbound,
        )

    if intake_incomplete:
        intake_status_value = INTAKE_INCOMPLETE
    elif fax_intake_status:
        intake_status_value = fax_intake_status
    else:
        intake_status_value = _normalize_text(payload.intake_status) or INTAKE_RECEIVED

    insert_fax_sql = """
        INSERT INTO fax_log (
            id, org_id, direction, fax_number, facility, patient_name, patient_dob, patient_mrn,
            patient_id, order_id, related_fax_id, review_status, review_reason,
            record_types, urgency, status, pages, service, sinch_fax_id, external_fax_id, document_hash, intake_status, sent_by, file_url,
            received_at, release_metadata, raw_webhook
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27::jsonb)
        """
    insert_fax_args = (
        fax_id,
        org_id,
        payload.direction or "inbound",
        payload.fax_number,
        payload.facility,
        context["patient_name"],
        context["patient_dob"],
        context["patient_mrn"],
        context["patient_id"],
        context["order_id"],
        str(matched_outbound["id"]) if matched_outbound and matched_outbound.get("id") else None,
        payload.review_status or review_status,
        payload.review_reason or review_reason,
        json.dumps(payload.record_types or []),
        payload.urgency,
        payload.status or "received",
        payload.pages,
        payload.service or "sinch",
        payload.sinch_fax_id,
        ext_fax,
        doc_hash,
        intake_status_value,
        payload.sent_by,
        payload.file_url,
        payload.received_at or datetime.now(timezone.utc).isoformat(),
        json.dumps(payload.release_metadata or {}),
        json.dumps(payload.raw_webhook or {}),
    )
    try:
        await exec_write(conn, insert_fax_sql, *insert_fax_args)
    except UniqueViolation:
        dup = None
        if ext_fax:
            dup = await fetch_one(
                conn,
                """
                SELECT id, org_id, patient_id, order_id, status, review_status, sinch_fax_id
                FROM fax_log
                WHERE direction = 'inbound' AND external_fax_id = $1
                ORDER BY created_at DESC
                LIMIT 1
                """,
                ext_fax,
            )
        if not dup and doc_hash:
            dup = await fetch_one(
                conn,
                """
                SELECT id, org_id, patient_id, order_id, status, review_status, sinch_fax_id
                FROM fax_log
                WHERE direction = 'inbound' AND document_hash = $1
                ORDER BY created_at DESC
                LIMIT 1
                """,
                doc_hash,
            )
        if dup:
            return {**dict(dup), "idempotent_replay": True}, None
        raise

    work = InboundIntakeWork(
        fax_id=fax_id,
        org_id=org_id,
        matched_outbound=matched_outbound,
        parsed_intake=parsed_intake,
        context=context,
        ext_fax=ext_fax,
        doc_hash=doc_hash,
        intake_incomplete=intake_incomplete,
        conf=conf,
        review_status=review_status,
        review_reason=review_reason,
    )
    return None, work


async def process_intake(
    conn: Any,
    redis: Any,
    work: InboundIntakeWork,
    payload: FaxLogEntryPayload,
) -> None:
    """Post–fax_log: optional order/case, workflow events, notifications, Redis fan-out."""
    org_id = work.org_id
    if not org_id:
        return
    fax_id = work.fax_id
    context = work.context
    parsed_intake = work.parsed_intake
    matched_outbound = work.matched_outbound
    intake_incomplete = work.intake_incomplete
    conf = work.conf
    review_status = work.review_status
    review_reason = work.review_reason

    order_created_new = False
    if not intake_incomplete and context.get("patient_id"):
        payer_guess = _normalize_text(
            ((parsed_intake.get("insurance_info") or {}).get("payer_name") if isinstance(parsed_intake.get("insurance_info"), dict) else None)
        )
        npi_guess = _normalize_text(parsed_intake.get("physician_npi"))
        hcpcs_codes = _split_codes(parsed_intake.get("hcpcs_codes"))
        if payer_guess and npi_guess and hcpcs_codes and not context.get("order_id"):
            existing_case = await fetch_one(
                conn,
                """
                SELECT id
                FROM orders
                WHERE org_id = $1
                  AND patient_id = $2
                  AND lower(coalesce(source_reference, '')) = lower($3)
                ORDER BY created_at DESC
                LIMIT 1
                """,
                org_id,
                context["patient_id"],
                f"fax:{payload.sinch_fax_id or fax_id}",
            )
            if existing_case:
                context["order_id"] = str(existing_case["id"])
            else:
                order_created_new = True
                created_order_id = str(uuid.uuid4())
                await exec_write(
                    conn,
                    """
                    INSERT INTO orders (
                        id, org_id, patient_id, status, payer_id, hcpcs_codes, referring_physician_npi,
                        source_channel, source_reference, source, intake_payload, created_by
                    )
                    VALUES ($1,$2,$3,'intake',$4,$5::jsonb,$6,'fax',$7,'fax_inbound',$8::jsonb,NULL)
                    """,
                    created_order_id,
                    org_id,
                    context["patient_id"],
                    payer_guess,
                    json.dumps(hcpcs_codes),
                    npi_guess,
                    f"fax:{payload.sinch_fax_id or fax_id}",
                    json.dumps(
                        {
                            "source": "fax_inbound",
                            "fax_id": fax_id,
                            "sinch_fax_id": payload.sinch_fax_id,
                            "ocr_payload": parsed_intake,
                            "processing_state": "normalization_complete",
                            "ingested_at": datetime.now(timezone.utc).isoformat(),
                        }
                    ),
                )
                context["order_id"] = created_order_id
                await _record_workflow_event(
                    conn,
                    org_id,
                    "case.created_from_fax",
                    {"order_id": created_order_id, "patient_id": context["patient_id"], "fax_id": fax_id},
                    order_id=created_order_id,
                )
    if context.get("order_id"):
        await _record_workflow_event(
            conn,
            org_id,
            "fax.received",
            {
                "fax_id": fax_id,
                "fax_number": payload.fax_number,
                "review_status": payload.review_status or review_status,
            },
            order_id=str(context["order_id"]),
        )
    await _record_workflow_event(
        conn,
        org_id,
        "fax.intake_received",
        {
            "fax_id": fax_id,
            "fax_number": payload.fax_number,
            "review_status": payload.review_status or review_status,
            "sinch_fax_id": payload.sinch_fax_id,
            "file_url": payload.file_url,
            "processing_state": "intake_incomplete" if intake_incomplete else None,
        },
        order_id=str(context["order_id"]) if context.get("order_id") else None,
    )
    await _create_notification(
        conn,
        org_id,
        "fax_intake_incomplete" if intake_incomplete else "fax_review_required",
        "Fax intake incomplete — review required" if intake_incomplete else "Inbound fax requires review",
        payload.review_reason or review_reason,
        {
            "fax_id": fax_id,
            "fax_number": payload.fax_number,
            "patient_id": context.get("patient_id"),
            "order_id": context.get("order_id"),
            "review_status": payload.review_status or review_status,
            "processing_state": "intake_incomplete" if intake_incomplete else None,
            "intake_confidence": conf if intake_incomplete else None,
            "intake_status": "case_created"
            if (not intake_incomplete and order_created_new)
            else ("intake_incomplete" if intake_incomplete else "processed"),
            "related_fax_id": str(matched_outbound["id"]) if matched_outbound and matched_outbound.get("id") else None,
        },
        order_id=str(context["order_id"]) if context.get("order_id") else None,
    )

    if not intake_incomplete:
        final_intake_status = INTAKE_CASE_CREATED if order_created_new else INTAKE_PROCESSED
        prev_row = await fetch_one(conn, "SELECT intake_status FROM fax_log WHERE id = $1", fax_id)
        prev = (prev_row or {}).get("intake_status")
        if not intake_transition_allowed(str(prev) if prev else None, final_intake_status):
            logger.warning(
                "fax %s intake_status transition rejected %s -> %s",
                fax_id,
                prev,
                final_intake_status,
            )
        else:
            await exec_write(
                conn,
                "UPDATE fax_log SET intake_status = $1 WHERE id = $2",
                final_intake_status,
                fax_id,
            )

    await redis.publish(
        "notifications.created",
        json.dumps(
            {
                "fax_id": fax_id,
                "patient_id": context.get("patient_id"),
                "order_id": context.get("order_id"),
                "type": "fax_intake_incomplete" if intake_incomplete else "fax_review_required",
                "processing_state": "intake_incomplete" if intake_incomplete else None,
                "intake_status": "intake_incomplete"
                if intake_incomplete
                else ("case_created" if order_created_new else "processed"),
            }
        ),
    )
    await redis.publish(
        "fax.intake.received",
        json.dumps(
            {
                "fax_id": fax_id,
                "org_id": org_id,
                "sinch_fax_id": payload.sinch_fax_id,
                "file_url": payload.file_url,
                "patient_id": context.get("patient_id"),
                "order_id": context.get("order_id"),
                "processing_state": "intake_incomplete" if intake_incomplete else None,
                "intake_status": "intake_incomplete"
                if intake_incomplete
                else ("case_created" if order_created_new else "processed"),
            }
        ),
    )


@app.post("/fax/inbound", status_code=201)
async def create_inbound_fax(
    payload: FaxLogEntryPayload,
    request: Request,
    _: bool = Depends(require_internal_api_key()),
):
    db = request.app.state.db_pool
    redis = get_redis(request)
    fax_id = str(uuid.uuid4())
    async with db.connection() as conn:
        idempotent, work = await create_intake_record(conn, fax_id, payload)
        if idempotent is not None:
            return _serialize(idempotent)
        assert work is not None
        await process_intake(conn, redis, work, payload)
        row = await fetch_one(conn, "SELECT * FROM fax_log WHERE id = $1", fax_id)
    return _serialize(dict(row or {"id": fax_id, "status": "received"}))


@app.patch("/fax/log/{fax_id}")
async def review_fax_log_entry(
    fax_id: str,
    payload: FaxReviewPayload,
    request: Request,
    user: dict = Depends(require_permissions("update_patients")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        await _require_fax_log(conn)
        existing = await fetch_one(
            conn,
            """
            SELECT id, org_id, patient_id, order_id
            FROM fax_log
            WHERE id = $1 AND org_id = $2
            """,
            fax_id,
            user["org_id"],
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Fax log entry not found")

        patient_context = await _resolve_fax_patient_context(
            conn,
            str(user["org_id"]),
            FaxLogEntryPayload(
                fax_number="",
                patient_id=payload.patient_id,
                order_id=payload.order_id,
            ),
        )
        await exec_write(
            conn,
            """
            UPDATE fax_log
            SET patient_id = $1,
                order_id = $2,
                review_status = $3,
                review_reason = $4
            WHERE id = $5 AND org_id = $6
            """,
            patient_context.get("patient_id"),
            patient_context.get("order_id"),
            payload.review_status,
            payload.review_reason,
            fax_id,
            user["org_id"],
        )
        row = await fetch_one(conn, "SELECT * FROM fax_log WHERE id = $1", fax_id)
    return _serialize(dict(row or {"id": fax_id, "review_status": payload.review_status}))

@app.post("/patients", status_code=201)
async def create_patient(
    payload: PatientCreate,
    request: Request,
    user: dict = Depends(require_permissions("create_patients")),
):
    org_id = str(user["org_id"])
    raw_idem = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
    idem = _normalize_text(raw_idem).strip()[:128] if raw_idem else ""
    data_key = f"patient:create:{org_id}:{idem}" if idem else ""
    lock_key = f"patient:create:lock:{org_id}:{idem}" if idem else ""
    redis = get_redis(request) if idem else None

    if idem and redis:
        try:
            existing_raw = await redis.get(data_key)
            if existing_raw:
                existing_id = (
                    existing_raw.decode()
                    if isinstance(existing_raw, (bytes, bytearray))
                    else str(existing_raw)
                )
                db = request.app.state.db_pool
                async with db.connection() as conn:
                    row = await fetch_one(
                        conn,
                        "SELECT id FROM patients WHERE id = $1 AND org_id = $2",
                        existing_id,
                        org_id,
                    )
                if row:
                    return {
                        "patient_id": existing_id,
                        "status": "created",
                        "idempotent_replay": True,
                    }
        except Exception as exc:
            logger.warning("Patient create idempotency read failed (continuing without): %s", exc)

        try:
            got_lock = await redis.set(lock_key, "1", nx=True, ex=45)
        except Exception as exc:
            got_lock = True
            logger.warning("Patient create idempotency lock unavailable: %s", exc)
        if not got_lock:
            for _ in range(40):
                await asyncio.sleep(0.05)
                try:
                    existing_raw = await redis.get(data_key)
                    if existing_raw:
                        existing_id = (
                            existing_raw.decode()
                            if isinstance(existing_raw, (bytes, bytearray))
                            else str(existing_raw)
                        )
                        db = request.app.state.db_pool
                        async with db.connection() as conn:
                            row = await fetch_one(
                                conn,
                                "SELECT id FROM patients WHERE id = $1 AND org_id = $2",
                                existing_id,
                                org_id,
                            )
                        if row:
                            return {
                                "patient_id": existing_id,
                                "status": "created",
                                "idempotent_replay": True,
                            }
                except Exception:
                    break
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another request is creating a patient with this Idempotency-Key; retry shortly.",
            )

    patient_id = str(uuid.uuid4())
    db = request.app.state.db_pool
    try:
        async with db.connection() as conn:
            norm = normalize_form_identity(
                payload.first_name,
                payload.last_name,
                payload.dob,
                payload.phone,
            )
            if not norm.normalization_complete:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Valid first name, last name, and date of birth are required.",
                )
            outcome = await match_form_patient_for_intake(
                conn, org_id, norm, fetch_one=fetch_one, fetch_all=fetch_all
            )
            if outcome.tier == MatchTier.UNCERTAIN:
                return JSONResponse(
                    status_code=409,
                    content={
                        "detail": "Patient identity is ambiguous or conflicts with existing records.",
                        "reason": outcome.reason,
                        "status": "ambiguous_match",
                    },
                )
            existing = None
            if outcome.tier in (MatchTier.EXACT, MatchTier.STRONG) and outcome.patient_id:
                existing = {"id": outcome.patient_id}
            if existing:
                await exec_write(
                    conn,
                    """
                    UPDATE patients
                    SET first_name = COALESCE(NULLIF(trim($1), ''), first_name),
                        last_name = COALESCE(NULLIF(trim($2), ''), last_name),
                        dob = COALESCE(NULLIF(trim($3), '')::date, dob),
                        insurance_id = COALESCE(NULLIF(trim($4), ''), insurance_id),
                        payer_id = COALESCE(NULLIF(trim($5), ''), payer_id),
                        diagnosis_codes = CASE
                            WHEN jsonb_array_length($6::jsonb) > 0 THEN $6::jsonb
                            ELSE diagnosis_codes
                        END,
                        phone = COALESCE(NULLIF(trim($7), ''), phone),
                        address = CASE
                            WHEN $8::jsonb = '{}'::jsonb THEN address
                            ELSE $8::jsonb
                        END,
                        email = COALESCE(NULLIF(trim($9), ''), email),
                        updated_at = NOW()
                    WHERE id = $10 AND org_id = $11
                    """,
                    payload.first_name,
                    payload.last_name,
                    payload.dob,
                    payload.insurance_id,
                    payload.payer_id,
                    json.dumps(payload.diagnosis_codes),
                    payload.phone,
                    json.dumps(payload.address or {}),
                    payload.email,
                    str(existing["id"]),
                    org_id,
                )
                await _record_workflow_event(
                    conn,
                    org_id,
                    "patient.matched_existing",
                    {
                        "patient_id": str(existing["id"]),
                        "match_rule": outcome.tier.value,
                        "strong_rule": outcome.strong_rule,
                        "idempotency_key": idem or None,
                    },
                    order_id=None,
                )
                return JSONResponse(
                    status_code=409,
                    content={
                        "detail": "Patient with the same identity already exists.",
                        "patient_id": str(existing["id"]),
                        "status": "exists_updated",
                        "match_tier": outcome.tier.value,
                    },
                )
            await exec_write(
                conn,
                """
                INSERT INTO patients (id, org_id, first_name, last_name, dob, insurance_id,
                    payer_id, diagnosis_codes, phone, address, email, created_by)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                """,
                patient_id,
                org_id,
                payload.first_name,
                payload.last_name,
                payload.dob,
                payload.insurance_id,
                payload.payer_id,
                json.dumps(payload.diagnosis_codes),
                payload.phone,
                json.dumps(payload.address or {}),
                payload.email,
                user["sub"],
            )
            await audit_log(
                conn,
                org_id,
                user["sub"],
                "create",
                "patients",
                resource_id=patient_id,
                ip_address=_client_ip(request),
            )
            await _record_workflow_event(
                conn,
                org_id,
                "patient.created",
                {
                    "patient_id": patient_id,
                    "payer_id": payload.payer_id,
                    "idempotency_key": idem or None,
                },
                order_id=None,
            )
    finally:
        if idem and redis:
            try:
                await redis.delete(lock_key)
            except Exception as exc:
                logger.warning("Patient idempotency lock release failed: %s", exc)

    if idem and redis:
        try:
            await redis.set(data_key, patient_id, ex=86400)
        except Exception as exc:
            logger.warning("Failed to store patient idempotency key (patient was created): %s", exc)

    logger.info("Patient created: %s org=%s", patient_id, org_id)
    return {"patient_id": patient_id, "status": "created"}


async def _delete_patient_dependencies(conn, org_id: str, patient_id: str) -> int:
    order_rows = await fetch_all(
        conn,
        "SELECT id FROM orders WHERE patient_id = $1 AND org_id = $2",
        patient_id,
        org_id,
    )
    order_ids = [str(row["id"]) for row in order_rows if row.get("id")]

    if order_ids:
        claim_rows = await fetch_all(
            conn,
            "SELECT id FROM eob_claims WHERE order_id = ANY($1::uuid[])",
            order_ids,
        )
        claim_ids = [str(row["id"]) for row in claim_rows if row.get("id")]

        denial_rows = await fetch_all(
            conn,
            """
            SELECT id FROM denials
            WHERE order_id = ANY($1::uuid[])
               OR ($2::uuid[] IS NOT NULL AND claim_id = ANY($2::uuid[]))
            """,
            order_ids,
            claim_ids or None,
        )
        denial_ids = [str(row["id"]) for row in denial_rows if row.get("id")]

        if denial_ids:
            await exec_write(conn, "DELETE FROM appeals WHERE denial_id = ANY($1::uuid[])", denial_ids)
        if claim_ids:
            await exec_write(conn, "DELETE FROM eob_worklist WHERE claim_id = ANY($1::uuid[])", claim_ids)

        # Delete order-linked rows explicitly so patient cleanup still works against
        # older databases that may not have the latest ON DELETE CASCADE constraints.
        await exec_write(conn, "DELETE FROM workflow_events WHERE order_id = ANY($1::uuid[])", order_ids)
        await exec_write(conn, "DELETE FROM appeals WHERE order_id = ANY($1::uuid[])", order_ids)
        await exec_write(conn, "DELETE FROM communications_messages WHERE order_id = ANY($1::uuid[])", order_ids)
        await exec_write(conn, "DELETE FROM notifications WHERE order_id = ANY($1::uuid[])", order_ids)
        # Preserve workflow_events for audit (order_id may reference deleted orders; no FK — ledger stays append-only).
        await exec_write(conn, "DELETE FROM shipments WHERE order_id = ANY($1::uuid[])", order_ids)
        await exec_write(conn, "DELETE FROM cmn_tracker WHERE order_id = ANY($1::uuid[])", order_ids)
        await exec_write(conn, "DELETE FROM claim_submissions WHERE order_id = ANY($1::uuid[])", order_ids)
        await exec_write(conn, "DELETE FROM auth_requests WHERE order_id = ANY($1::uuid[])", order_ids)
        await exec_write(conn, "DELETE FROM payment_outcomes WHERE order_id = ANY($1::uuid[])", order_ids)
        await exec_write(conn, "DELETE FROM eligibility_checks WHERE order_id = ANY($1::uuid[])", order_ids)
        await exec_write(conn, "DELETE FROM order_documents WHERE order_id = ANY($1::uuid[])", order_ids)
        await exec_write(conn, "DELETE FROM order_line_items WHERE order_id = ANY($1::uuid[])", order_ids)
        await exec_write(conn, "DELETE FROM order_diagnoses WHERE order_id = ANY($1::uuid[])", order_ids)
        await exec_write(
            conn,
            """
            UPDATE fax_log
            SET order_id = NULL,
                review_status = CASE
                    WHEN review_status = 'linked_to_chart' THEN 'pending_patient_match'
                    ELSE review_status
                END
            WHERE org_id = $1 AND order_id = ANY($2::uuid[])
            """,
            org_id,
            order_ids,
        )
        await exec_write(conn, "DELETE FROM denials WHERE order_id = ANY($1::uuid[])", order_ids)
        if claim_ids:
            await exec_write(conn, "DELETE FROM denials WHERE claim_id = ANY($1::uuid[])", claim_ids)
            await exec_write(conn, "DELETE FROM eob_claims WHERE id = ANY($1::uuid[])", claim_ids)
        await exec_write(conn, "DELETE FROM orders WHERE id = ANY($1::uuid[]) AND org_id = $2", order_ids, org_id)

    await exec_write(conn, "DELETE FROM patient_notes WHERE patient_id = $1 AND org_id = $2", patient_id, org_id)
    await exec_write(conn, "DELETE FROM eligibility_checks WHERE patient_id = $1", patient_id)
    await exec_write(conn, "DELETE FROM cmn_tracker WHERE patient_id = $1", patient_id)
    await exec_write(
        conn,
        """
        UPDATE fax_log
        SET patient_id = NULL,
            order_id = NULL,
            review_status = CASE
                WHEN review_status = 'linked_to_chart' THEN 'pending_patient_match'
                ELSE review_status
            END
        WHERE org_id = $1 AND patient_id = $2::uuid
        """,
        org_id,
        patient_id,
    )
    await exec_write(conn, "DELETE FROM patient_insurances WHERE patient_id = $1", patient_id)
    await exec_write(conn, "DELETE FROM patients WHERE id = $1 AND org_id = $2", patient_id, org_id)
    return len(order_ids)


@app.delete("/patients/{patient_id}")
async def delete_patient(
    patient_id: str,
    request: Request,
    user: dict = Depends(require_permissions("update_patients")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        patient = await fetch_one(
            conn,
            "SELECT id, first_name, last_name FROM patients WHERE id = $1 AND org_id = $2",
            patient_id,
            user["org_id"],
        )
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        deleted_orders = await _delete_patient_dependencies(conn, str(user["org_id"]), patient_id)
        await audit_log(
            conn,
            str(user["org_id"]),
            str(user["sub"]),
            "delete",
            "patients",
            resource_id=patient_id,
            ip_address=_client_ip(request),
        )

    return {"patient_id": patient_id, "deleted_orders": deleted_orders, "status": "deleted"}


@app.get("/patients")
async def list_patients(
    request: Request,
    user: dict = Depends(require_permissions("view_patients")),
    limit: int = 50,
    offset: int = 0,
    status_filter: str | None = None,
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        rows = await fetch_all(
            conn,
            """
            SELECT id, first_name, last_name, dob, email, insurance_id, payer_id,
                   diagnosis_codes, created_at
            FROM patients
            WHERE org_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            """,
            user["org_id"], limit, offset,
        )
    return {"patients": [dict(r) for r in rows], "limit": limit, "offset": offset}


@app.get("/patients/{patient_id}")
async def get_patient(patient_id: str, request: Request, user: dict = Depends(require_permissions("view_patients"))):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        row = await fetch_one(
            conn,
            "SELECT * FROM patients WHERE id = $1 AND org_id = $2",
            patient_id, user["org_id"],
        )
    if not row:
        raise HTTPException(status_code=404, detail="Patient not found")
    return dict(row)


@app.patch("/patients/{patient_id}")
async def patch_patient(
    patient_id: str,
    payload: PatientUpdate,
    request: Request,
    user: dict = Depends(require_permissions("update_patients")),
):
    db = request.app.state.db_pool
    updates: list[str] = []
    params: list[Any] = []

    if payload.first_name is not None:
        updates.append(f"first_name = ${len(params) + 1}")
        params.append(payload.first_name)
    if payload.last_name is not None:
        updates.append(f"last_name = ${len(params) + 1}")
        params.append(payload.last_name)
    if payload.dob is not None:
        updates.append(f"dob = ${len(params) + 1}")
        params.append(payload.dob)
    if payload.email is not None:
        updates.append(f"email = ${len(params) + 1}")
        params.append(payload.email)
    if payload.insurance_id is not None:
        updates.append(f"insurance_id = ${len(params) + 1}")
        params.append(payload.insurance_id)
    if payload.payer_id is not None:
        updates.append(f"payer_id = ${len(params) + 1}")
        params.append(payload.payer_id)
    if payload.diagnosis_codes is not None:
        updates.append(f"diagnosis_codes = ${len(params) + 1}::jsonb")
        params.append(json.dumps(payload.diagnosis_codes))
    if payload.phone is not None:
        updates.append(f"phone = ${len(params) + 1}")
        params.append(payload.phone)
    if payload.address is not None:
        updates.append(f"address = ${len(params) + 1}::jsonb")
        params.append(json.dumps(payload.address))

    if not updates:
        raise HTTPException(status_code=400, detail="No patch fields were provided")

    updates.append("updated_at = NOW()")
    params.extend([patient_id, user["org_id"]])

    async with db.connection() as conn:
        rowcount = await exec_write(
            conn,
            f"UPDATE patients SET {', '.join(updates)} WHERE id = ${len(params) - 1} AND org_id = ${len(params)}",
            *params,
        )
        if rowcount == 0:
            raise HTTPException(status_code=404, detail="Patient not found")
        await _record_workflow_event(
            conn,
            str(user["org_id"]),
            "patient.updated",
            {"patient_id": patient_id, "fields": [k for k, v in payload.model_dump().items() if v is not None]},
            order_id=None,
        )
        row = await fetch_one(conn, "SELECT * FROM patients WHERE id = $1 AND org_id = $2", patient_id, user["org_id"])
    return _serialize(dict(row or {"id": patient_id}))


@app.get("/patients/{patient_id}/orders")
async def list_patient_orders(
    patient_id: str,
    request: Request,
    user: dict = Depends(require_permissions("view_patients")),
):
    """List orders (packages) for a patient so they can be shown in the patient account."""
    db = request.app.state.db_pool
    async with db.connection() as conn:
        # Verify patient belongs to org
        patient = await fetch_one(
            conn,
            "SELECT id FROM patients WHERE id = $1 AND org_id = $2",
            patient_id, user["org_id"],
        )
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        rows = await fetch_all(
            conn,
            """
            SELECT o.id, o.status, o.priority, o.hcpcs_codes, o.payer_id,
                   o.created_at, o.updated_at, o.denial_category, o.denied_amount,
                   o.swo_document_id, o.cms1500_document_id, o.pod_document_id
            FROM orders o
            WHERE o.patient_id = $1 AND o.org_id = $2
            ORDER BY o.created_at DESC
            """,
            patient_id, user["org_id"],
        )
    return {"patient_id": patient_id, "orders": [dict(r) for r in rows]}


@app.get("/patients/{patient_id}/chart")
async def get_patient_chart(
    patient_id: str,
    request: Request,
    user: dict = Depends(require_permissions("view_patients")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        patient = await fetch_one(
            conn,
            """
            SELECT id, org_id, first_name, last_name, dob, email, phone, insurance_id, payer_id, diagnosis_codes, address,
                   next_of_kin, drivers_license, created_at
            FROM patients
            WHERE id = $1 AND org_id = $2
            """,
            patient_id,
            user["org_id"],
        )
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        order_rows = await fetch_all(
            conn,
            """
            SELECT id
            FROM orders
            WHERE patient_id = $1 AND org_id = $2
            ORDER BY created_at DESC
            """,
            patient_id,
            user["org_id"],
        )
        order_ids = [str(row["id"]) for row in order_rows]
        order_bundles: list[dict[str, Any]] = []
        for order_id in order_ids:
            bundle = await _fetch_order_bundle(conn, user["org_id"], order_id)
            if not bundle:
                continue
            documents = []
            primary_docs = {
                "swo": None,
                "cms1500": None,
                "pod": None,
            }
            for document in bundle.get("documents", []):
                item = dict(document)
                if item.get("storage_bucket") and item.get("storage_key"):
                    item["download_url"] = _presigned_download_url(item["storage_bucket"], item["storage_key"])
                documents.append(_serialize(item))
            for key, field_name in [("swo", "swo_document_id"), ("cms1500", "cms1500_document_id"), ("pod", "pod_document_id")]:
                document_id = bundle.get(field_name)
                if document_id:
                    primary_docs[key] = next((doc for doc in documents if str(doc.get("id")) == str(document_id)), {"id": document_id})
            bundle["documents"] = documents
            bundle["primary_documents"] = primary_docs
            order_bundles.append(_serialize(bundle))

        denials = await _safe_fetch_all(
            conn,
            """
            SELECT *
            FROM denials
            WHERE order_id = ANY($1)
            ORDER BY denial_date DESC NULLS LAST, created_at DESC
            """,
            order_ids or [None],
            label="denials",
        ) if order_ids else []
        denial_ids = [str(row["id"]) for row in denials]
        appeals = await _safe_fetch_all(
            conn,
            """
            SELECT *
            FROM appeals
            WHERE denial_id = ANY($1) OR order_id = ANY($2)
            ORDER BY created_at DESC
            """,
            denial_ids or [None],
            order_ids or [None],
            label="appeals",
        ) if order_ids else []
        eobs = await _safe_fetch_all(
            conn,
            """
            SELECT *
            FROM eob_claims
            WHERE order_id = ANY($1)
            ORDER BY COALESCE(date_of_remittance, date_of_service) DESC NULLS LAST, created_at DESC
            """,
            order_ids or [None],
            label="eobs",
        ) if order_ids else []
        payments = await _safe_fetch_all(
            conn,
            """
            SELECT *
            FROM payment_outcomes
            WHERE order_id = ANY($1)
            ORDER BY COALESCE(payment_date, date_of_service) DESC NULLS LAST, created_at DESC
            """,
            order_ids or [None],
            label="payments",
        ) if order_ids else []
        fax_rows: list[dict[str, Any]] = []
        fax_columns = await _table_columns(conn, "fax_log")
        if "patient_id" in fax_columns:
            fax_select = [
                "id",
                "direction",
                "fax_number",
                "facility",
                "patient_name",
                "patient_dob",
                "patient_mrn",
                "record_types",
                "urgency",
                "status",
                "pages",
                "service",
                "sinch_fax_id",
                "sent_by",
                "file_url",
                "received_at",
                "release_metadata",
                "raw_webhook",
                "created_at",
            ]
            optional_fax_columns = [
                "patient_id",
                "order_id",
                "related_fax_id",
                "review_status",
                "review_reason",
                "external_fax_id",
                "document_hash",
                "intake_status",
            ]
            fax_select.extend([column for column in optional_fax_columns if column in fax_columns])
            fax_rows = await _safe_fetch_all(
                conn,
                f"""
                SELECT {", ".join(fax_select)}
                FROM fax_log
                WHERE org_id = $1 AND patient_id = $2
                ORDER BY COALESCE(received_at, created_at) DESC
                LIMIT 25
                """,
                user["org_id"],
                patient_id,
                label="fax_log",
            )

        notes_rows = await _safe_fetch_all(
            conn,
            """
            SELECT id, patient_id, author_id, author_name, content, created_at
            FROM patient_notes
            WHERE patient_id = $1 AND org_id = $2
            ORDER BY created_at DESC
            LIMIT 100
            """,
            patient_id,
            user["org_id"],
            label="patient_notes",
        )

        denial_row_by_order: dict[str, dict[str, Any]] = {}
        for d in denials:
            oid = str(d.get("order_id") or "")
            if oid and oid not in denial_row_by_order:
                denial_row_by_order[oid] = dict(d)

        for bundle in order_bundles:
            oid = str(bundle.get("id") or "")
            try:
                await _enrich_chart_order_bundle(
                    conn, str(user["org_id"]), bundle, denial_row_by_order.get(oid)
                )
            except Exception as exc:
                logger.warning("Patient chart skipped enrichment for order %s: %s", oid, exc)
                bundle["predictive_modeling"] = _serialize(
                    _build_outstanding_protocol(
                        {
                            "id": bundle.get("id"),
                            "patient_id": bundle.get("patient_id"),
                            "first_name": bundle.get("patient_first_name"),
                            "last_name": bundle.get("patient_last_name"),
                            "status": bundle.get("status"),
                            "payer_id": bundle.get("payer_id"),
                            "payer_name": bundle.get("payer_name") or bundle.get("payer_id"),
                            "hcpcs_codes": bundle.get("hcpcs_codes"),
                            "baseline_denial_rate": bundle.get("payer_baseline_denial_rate") or 0.35,
                            "updated_at": bundle.get("updated_at"),
                            "created_at": bundle.get("created_at"),
                            "denied_amount": bundle.get("denied_amount"),
                            "paid_amount": bundle.get("paid_amount"),
                            "denial_category": bundle.get("denial_category"),
                        }
                    )
                )

    summary = {
        "total_orders": len(order_bundles),
        "signed_swo_count": sum(1 for order in order_bundles if str(order.get("swo_status") or "").lower() == "ingested"),
        "payments_count": len(payments),
        "denials_count": len(denials),
        "appeals_count": len(appeals),
        "eobs_count": len(eobs),
        "paid_amount_total": round(sum(float(item.get("paid_amount") or 0) for item in payments), 2),
        "denied_amount_total": round(sum(float(item.get("denied_amount") or 0) for item in denials), 2),
    }

    patient_out = dict(patient)
    dl_raw = patient_out.get("drivers_license")
    if isinstance(dl_raw, str):
        try:
            dl_raw = json.loads(dl_raw)
        except json.JSONDecodeError:
            dl_raw = {}
    if isinstance(dl_raw, dict) and dl_raw.get("storage_bucket") and dl_raw.get("storage_key"):
        try:
            patient_out["drivers_license_download_url"] = _presigned_download_url(
                str(dl_raw["storage_bucket"]), str(dl_raw["storage_key"])
            )
        except Exception:
            patient_out["drivers_license_download_url"] = None

    example_oid = str(order_ids[0]) if order_ids else ""
    devices_flat: list[dict[str, Any]] = []
    for ob in order_bundles:
        oid = str(ob.get("id") or "")
        for li in ob.get("line_items") or []:
            if isinstance(li, dict):
                row = dict(li)
                row["order_id"] = oid
                devices_flat.append(_serialize(row))

    doc_count = sum(len(ob.get("documents") or []) for ob in order_bundles)
    logger.info(
        "patient_chart_loaded patient_id=%s org=%s orders=%s notes=%s order_documents=%s devices=%s",
        patient_id,
        user["org_id"],
        len(order_bundles),
        len(notes_rows),
        doc_count,
        len(devices_flat),
    )

    return {
        "patient": _serialize(patient_out),
        "summary": summary,
        "orders": order_bundles,
        "devices": devices_flat,
        "notes": _serialize(notes_rows),
        "payments": _serialize(payments),
        "denials": _serialize(denials),
        "appeals": _serialize(appeals),
        "eobs": _serialize(eobs),
        "faxes": _serialize(fax_rows),
        "pod_delivery_guidance": pod_delivery_guidance_payload(example_oid or None),
    }


@app.get("/patients/{patient_id}/drivers-license/download")
async def download_drivers_license(
    patient_id: str,
    request: Request,
    user: dict = Depends(require_permissions("view_patients")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        row = await fetch_one(conn, "SELECT drivers_license FROM patients WHERE id = $1 AND org_id = $2", patient_id, user["org_id"])
    if not row:
        raise HTTPException(status_code=404, detail="Patient not found")
    dl_raw = row.get("drivers_license")
    if isinstance(dl_raw, str):
        try:
            dl_raw = json.loads(dl_raw)
        except json.JSONDecodeError:
            dl_raw = {}
    if not isinstance(dl_raw, dict) or not dl_raw.get("storage_bucket") or not dl_raw.get("storage_key"):
        raise HTTPException(status_code=404, detail="No driver's license on file")
    return {"download_url": _presigned_download_url(str(dl_raw["storage_bucket"]), str(dl_raw["storage_key"]))}


# ---------------------------------------------------------------------------
# Patient Notes & Bulk Assignment
# ---------------------------------------------------------------------------

@app.get("/patients/{patient_id}/notes")
async def list_patient_notes(
    patient_id: str,
    request: Request,
    user: dict = Depends(require_permissions("view_patients")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        patient = await fetch_one(
            conn,
            "SELECT id FROM patients WHERE id = $1 AND org_id = $2",
            patient_id,
            user["org_id"],
        )
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        notes = await fetch_all(
            conn,
            """
            SELECT id, patient_id, author_id, author_name, content, created_at
            FROM patient_notes
            WHERE patient_id = $1 AND org_id = $2
            ORDER BY created_at DESC
            """,
            patient_id,
            user["org_id"],
        )
    return {"notes": _serialize(notes)}


@app.post("/patients/{patient_id}/notes", status_code=201)
async def create_patient_note(
    patient_id: str,
    payload: PatientNoteCreate,
    request: Request,
    user: dict = Depends(require_permissions("view_patients")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        patient = await fetch_one(
            conn,
            "SELECT id FROM patients WHERE id = $1 AND org_id = $2",
            patient_id,
            user["org_id"],
        )
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        user_id = user.get("sub") or user.get("user_id", "")
        author = await fetch_one(
            conn,
            "SELECT first_name, last_name FROM users WHERE id = $1",
            user_id,
        )
        author_name = " ".join(
            part for part in [
                (author or {}).get("first_name") or "",
                (author or {}).get("last_name") or "",
            ] if part
        ) or user.get("email", "")
        note_id = str(uuid.uuid4())
        await exec_write(
            conn,
            """
            INSERT INTO patient_notes (id, org_id, patient_id, author_id, author_name, content)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            note_id,
            user["org_id"],
            patient_id,
            user_id,
            author_name,
            payload.content,
        )
        note = await fetch_one(
            conn,
            "SELECT id, patient_id, author_id, author_name, content, created_at FROM patient_notes WHERE id = $1",
            note_id,
        )
    return _serialize(note)


@app.patch("/patients/{patient_id}/assign-rep")
async def assign_patient_rep(
    patient_id: str,
    payload: PatientAssignRepRequest,
    request: Request,
    user: dict = Depends(require_permissions("assign_orders")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        patient = await fetch_one(
            conn,
            "SELECT id FROM patients WHERE id = $1 AND org_id = $2",
            patient_id,
            user["org_id"],
        )
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        orders_updated = await exec_write(
            conn,
            "UPDATE orders SET assigned_to = $1, updated_at = NOW() WHERE patient_id = $2 AND org_id = $3",
            payload.rep_id,
            patient_id,
            user["org_id"],
        )
        assigned_user = await fetch_one(
            conn,
            "SELECT id, email, first_name, last_name FROM users WHERE id = $1",
            payload.rep_id,
        )
        display = _display_assignee({
            "assigned_first_name": (assigned_user or {}).get("first_name"),
            "assigned_last_name": (assigned_user or {}).get("last_name"),
            "assigned_email": (assigned_user or {}).get("email"),
        })
    return {
        "patient_id": patient_id,
        "rep_id": payload.rep_id,
        "orders_updated": orders_updated,
        "assignee_display": display,
    }


@app.get("/users/reps")
async def list_reps(
    request: Request,
    user: dict = Depends(require_permissions("assign_orders")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        rows = await fetch_all(
            conn,
            """
            SELECT id, email, first_name, last_name, role
            FROM users
            WHERE org_id = $1
              AND is_active = TRUE
              AND role IN ('admin', 'rep', 'billing', 'intake')
            ORDER BY last_name, first_name
            """,
            user["org_id"],
        )
    users_out = []
    for row in rows:
        display = _display_assignee({
            "assigned_first_name": row.get("first_name"),
            "assigned_last_name": row.get("last_name"),
            "assigned_email": row.get("email"),
        })
        users_out.append({
            "id": str(row["id"]),
            "email": row.get("email"),
            "first_name": row.get("first_name"),
            "last_name": row.get("last_name"),
            "role": row.get("role"),
            "display": display,
        })
    return {"users": users_out}


# ---------------------------------------------------------------------------
# Order Routes
# ---------------------------------------------------------------------------

async def _score_order_with_trident(request: Request, org_id: str, order_id: str) -> None:
    candidate_bases: list[str] = []
    for base in [
        settings.trident_url,
        "http://poseidon_trident:8002",
        "http://trident:8002",
    ]:
        normalized = (base or "").strip().rstrip("/")
        if normalized and normalized not in candidate_bases:
            candidate_bases.append(normalized)
    if not candidate_bases:
        return
    db = request.app.state.db_pool
    try:
        async with db.connection() as conn:
            order = await fetch_one(
                conn,
                """
                SELECT o.id, o.payer_id, o.hcpcs_codes, p.dob
                FROM orders o
                JOIN patients p ON p.id = o.patient_id
                WHERE o.id = $1 AND o.org_id = $2
                """,
                order_id,
                org_id,
            )
            if not order:
                return
            diags = await fetch_all(
                conn,
                "SELECT icd10_code FROM order_diagnoses WHERE order_id = $1 ORDER BY sequence",
                order_id,
            )
        icd10_codes = [str(d["icd10_code"]) for d in diags if d.get("icd10_code")] or ["Z00.00"]
        hcpcs_codes = [str(x) for x in _coerce_json_list(order.get("hcpcs_codes"))]
        if not hcpcs_codes:
            hcpcs_codes, inferred_from = _infer_hcpcs_from_diagnosis(icd10_codes)
            logger.warning(
                "Order %s missing HCPCS for Trident scoring; inferred %s from %s",
                order_id,
                ",".join(hcpcs_codes),
                inferred_from,
            )
        score_body = {
            "icd10_codes": icd10_codes,
            "hcpcs_codes": hcpcs_codes,
            "payer_id": str(order.get("payer_id") or "UNKNOWN"),
            "patient_age": _patient_age_years(order.get("dob")),
        }
        recommended_hcpcs_by_icd10: list[dict[str, Any]] = []
        trident_base_used = ""
        async with httpx.AsyncClient(timeout=20.0) as client:
            tr = None
            for base in candidate_bases:
                try:
                    candidate = await client.post(f"{base}/api/v1/trident/score", json=score_body)
                    if candidate.is_success:
                        tr = candidate
                        trident_base_used = base
                        break
                except httpx.HTTPError:
                    continue
            if tr is None:
                return
            payload = tr.json()
            score = payload.get("score", payload.get("denial_probability"))
            score_val = float(score) if isinstance(score, (int, float)) else None
            if score_val is None:
                return
            tier = "high" if score_val >= settings.denial_threshold else "med" if score_val >= 0.35 else "low"
            for icd10 in icd10_codes:
                try:
                    cm = await client.get(f"{trident_base_used}/api/v1/trident/code-map", params={"icd10": icd10})
                except httpx.HTTPError:
                    continue
                if not cm.is_success:
                    continue
                parsed = cm.json()
                cm_payload = parsed if isinstance(parsed, dict) else {}
                for row in cm_payload.get("matches") or []:
                    code = _normalize_text(row.get("hcpcs_code")).upper()
                    if not code:
                        continue
                    recommended_hcpcs_by_icd10.append(
                        {
                            "icd10": icd10,
                            "hcpcs_code": code,
                            "avg_reimbursement": float(row.get("avg_reimbursement") or 0),
                            "denial_probability": float(row.get("denial_probability") or 0),
                            "sample_count": int(row.get("sample_count") or 0),
                        }
                    )
        best_codes = sorted(
            recommended_hcpcs_by_icd10,
            key=lambda r: (float(r.get("avg_reimbursement") or 0), int(r.get("sample_count") or 0)),
            reverse=True,
        )[:5]
        trident_flags = {
            "icd10_codes": icd10_codes,
            "input_hcpcs_codes": hcpcs_codes,
            "recommended_hcpcs_by_icd10": best_codes,
            "score_payload": payload,
            "scored_at": datetime.now(timezone.utc).isoformat(),
        }
        async with db.connection() as conn:
            await exec_write(
                conn,
                """
                UPDATE orders
                SET denial_risk_score = $1,
                    risk_tier = $2,
                    trident_flags = $3::jsonb,
                    updated_at = NOW()
                WHERE id = $4 AND org_id = $5
                """,
                score_val,
                tier,
                json.dumps(trident_flags),
                order_id,
                org_id,
            )
    except Exception:
        logger.exception("Non-blocking Trident scoring failed for order %s", order_id)


@app.get("/reference/physicians/lookup")
async def lookup_physician_by_npi(
    npi: str,
    request: Request,
    user: dict = Depends(require_permissions("view_patients")),
):
    normalized_npi = _normalize_text(npi)
    if not re.fullmatch(r"\d{10}", normalized_npi):
        raise HTTPException(status_code=400, detail="NPI must be exactly 10 digits.")

    db = request.app.state.db_pool
    async with db.connection() as conn:
        local_match = await fetch_one(
            conn,
            """
            SELECT id, npi, first_name, last_name, specialty, phone, fax, facility_name, address
            FROM physicians
            WHERE npi = $1
              AND (org_id::text = $2 OR org_id IS NULL)
            ORDER BY CASE WHEN org_id::text = $2 THEN 0 ELSE 1 END, created_at DESC
            LIMIT 1
            """,
            normalized_npi,
            user["org_id"],
        )
    if local_match:
        return {
            "source": "local",
            "physician": {
                "npi": _normalize_text(local_match.get("npi")),
                "first_name": local_match.get("first_name"),
                "last_name": local_match.get("last_name"),
                "full_name": " ".join(
                    [str(local_match.get("first_name") or "").strip(), str(local_match.get("last_name") or "").strip()]
                ).strip(),
                "specialty": local_match.get("specialty"),
                "phone": local_match.get("phone"),
                "fax": local_match.get("fax"),
                "facility_name": local_match.get("facility_name"),
                "address": local_match.get("address") or {},
            },
        }

    registry_base = _normalize_text(os.getenv("NPI_REGISTRY_BASE_URL")) or "https://npiregistry.cms.hhs.gov/api"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                registry_base,
                params={"version": "2.1", "number": normalized_npi},
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Unable to reach NPI registry.")
    if not response.is_success:
        raise HTTPException(status_code=502, detail="NPI registry lookup failed.")
    payload = response.json()
    results = payload.get("results") if isinstance(payload, dict) else []
    if not isinstance(results, list) or not results:
        raise HTTPException(status_code=404, detail="Physician NPI not found.")
    first = results[0] if isinstance(results[0], dict) else {}
    basic = first.get("basic") if isinstance(first.get("basic"), dict) else {}
    addresses = first.get("addresses") if isinstance(first.get("addresses"), list) else []
    practice_address = next((a for a in addresses if isinstance(a, dict) and str(a.get("address_purpose", "")).upper() == "LOCATION"), None)
    if practice_address is None:
        practice_address = next((a for a in addresses if isinstance(a, dict)), {})
    taxonomies = first.get("taxonomies") if isinstance(first.get("taxonomies"), list) else []
    primary_taxonomy = next((t for t in taxonomies if isinstance(t, dict) and t.get("primary")), None)
    if primary_taxonomy is None:
        primary_taxonomy = next((t for t in taxonomies if isinstance(t, dict)), {})
    phone = _normalize_text(practice_address.get("telephone_number")) if isinstance(practice_address, dict) else ""
    fax = _normalize_text(practice_address.get("fax_number")) if isinstance(practice_address, dict) else ""
    full_name = " ".join(
        [
            _normalize_text(basic.get("first_name")),
            _normalize_text(basic.get("last_name")),
        ]
    ).strip()
    return {
        "source": "npi_registry",
        "physician": {
            "npi": normalized_npi,
            "first_name": _normalize_text(basic.get("first_name")) or None,
            "last_name": _normalize_text(basic.get("last_name")) or None,
            "full_name": full_name or None,
            "specialty": _normalize_text(primary_taxonomy.get("desc")) or None,
            "phone": phone or None,
            "fax": fax or None,
            "facility_name": _normalize_text(practice_address.get("organization_name")) if isinstance(practice_address, dict) else None,
            "address": practice_address if isinstance(practice_address, dict) else {},
        },
    }


@app.get("/reference/payers")
async def list_reference_payers(
    request: Request,
    user: dict = Depends(require_permissions("view_patients")),
    q: str | None = None,
):
    """Active payers from the canonical directory (Availity-aligned payer IDs for 270/837)."""
    db = request.app.state.db_pool
    needle = _normalize_text(q).strip()
    async with db.connection() as conn:
        if needle:
            pattern = f"%{needle}%"
            rows = await fetch_all(
                conn,
                """
                SELECT id, name, availity_payer_id, availity_payer_name
                FROM payers
                WHERE active = true
                  AND (
                    id ILIKE $1
                    OR name ILIKE $1
                    OR COALESCE(availity_payer_id, '') ILIKE $1
                  )
                ORDER BY name ASC
                LIMIT 100
                """,
                pattern,
            )
        else:
            rows = await fetch_all(
                conn,
                """
                SELECT id, name, availity_payer_id, availity_payer_name
                FROM payers
                WHERE active = true
                ORDER BY name ASC
                LIMIT 500
                """,
            )
    out: list[dict[str, Any]] = []
    for r in rows:
        edi_pi = r.get("availity_payer_id")
        edi_nm = r.get("availity_payer_name")
        out.append(
            {
                "id": str(r["id"]),
                "name": str(r["name"]),
                "availity_payer_id": str(edi_pi) if edi_pi else None,
                "availity_payer_name": str(edi_nm) if edi_nm else None,
            }
        )
    return {"payers": out}


@app.post("/intake/coding-recommendations")
async def intake_coding_recommendations(
    payload: CodingRecommendationRequest,
    request: Request,
    user: dict = Depends(require_permissions("create_orders")),
):
    icd10_codes = payload.icd10_codes
    inferred_codes, inferred_source = _infer_hcpcs_from_diagnosis(icd10_codes)

    trident_rows: list[dict[str, Any]] = []
    candidate_bases: list[str] = []
    for base in [settings.trident_url, "http://poseidon_trident:8002", "http://trident:8002"]:
        normalized = _normalize_text(base).rstrip("/")
        if normalized and normalized not in candidate_bases:
            candidate_bases.append(normalized)
    if candidate_bases:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                trident_base_used = ""
                for candidate in candidate_bases:
                    try:
                        health = await client.get(f"{candidate}/health")
                    except httpx.HTTPError:
                        continue
                    if health.is_success:
                        trident_base_used = candidate
                        break
                if trident_base_used:
                    for icd10 in icd10_codes:
                        try:
                            cm = await client.get(f"{trident_base_used}/api/v1/trident/code-map", params={"icd10": icd10})
                        except httpx.HTTPError:
                            continue
                        if not cm.is_success:
                            continue
                        parsed = cm.json()
                        matches = parsed.get("matches") if isinstance(parsed, dict) else []
                        if not isinstance(matches, list):
                            continue
                        for row in matches:
                            if not isinstance(row, dict):
                                continue
                            code = _normalize_text(row.get("hcpcs_code")).upper()
                            if not code:
                                continue
                            trident_rows.append(
                                {
                                    "hcpcs_code": code,
                                    "icd10": icd10,
                                    "avg_reimbursement": float(row.get("avg_reimbursement") or 0),
                                    "denial_probability": float(row.get("denial_probability") or 0),
                                    "sample_count": int(row.get("sample_count") or 0),
                                }
                            )
        except Exception:
            logger.exception("Non-blocking coding recommendation lookup failed")

    trident_codes = [str(r.get("hcpcs_code")) for r in trident_rows if r.get("hcpcs_code")]
    candidate_codes = sorted({*(c.upper() for c in inferred_codes if c), *(c.upper() for c in trident_codes if c)})
    if not candidate_codes:
        raise HTTPException(status_code=422, detail="No candidate HCPCS codes found for given ICD-10 inputs.")

    db = request.app.state.db_pool
    async with db.connection() as conn:
        auth_requirements = await fetch_all(
            conn,
            """
            SELECT DISTINCT ON (hcpcs_code)
                hcpcs_code, requires_auth, required_documents, notes, effective_date
            FROM payer_auth_requirements
            WHERE payer_id = $1
              AND hcpcs_code = ANY($2::text[])
            ORDER BY hcpcs_code, effective_date DESC
            """,
            payload.payer_id,
            candidate_codes,
        )
        learned_rates = await _fetch_learned_rates_map(
            conn,
            user["org_id"],
            payload.payer_id,
            candidate_codes,
        )

    auth_by_code = {str(row["hcpcs_code"]).upper(): row for row in auth_requirements}
    trident_by_code: dict[str, dict[str, Any]] = {}
    for row in trident_rows:
        code = str(row.get("hcpcs_code") or "").upper()
        if not code:
            continue
        existing = trident_by_code.get(code)
        if not existing or float(row.get("sample_count") or 0) > float(existing.get("sample_count") or 0):
            trident_by_code[code] = row

    recommendations: list[dict[str, Any]] = []
    for code in candidate_codes:
        lr = learned_rates.get(code)
        tr = trident_by_code.get(code)
        auth = auth_by_code.get(code)
        denial_probability = float(tr.get("denial_probability") or 0.0) if tr else float(lr.get("denial_rate") or 0.0) if lr else 0.0
        avg_paid = float(lr.get("median_paid") or lr.get("avg_paid") or 0.0) if lr else float(tr.get("avg_reimbursement") or 0.0) if tr else 0.0
        score = (avg_paid * max(0.05, 1.0 - denial_probability)) + (15.0 if auth and not auth.get("requires_auth") else 0.0)
        recommendations.append(
            {
                "hcpcs_code": code,
                "score": round(score, 4),
                "requires_auth": bool(auth.get("requires_auth")) if auth else None,
                "required_documents": auth.get("required_documents") if auth else [],
                "payer_notes": auth.get("notes") if auth else None,
                "avg_reimbursement": round(avg_paid, 2) if avg_paid else None,
                "denial_probability": round(denial_probability, 4) if denial_probability else None,
                "sample_count": int((lr or {}).get("sample_count") or (tr or {}).get("sample_count") or 0),
                "source": {
                    "icd10_inferred": code in {c.upper() for c in inferred_codes},
                    "trident_mapped": code in trident_by_code,
                    "learned_rates": bool(lr),
                    "payer_rules": bool(auth),
                },
            }
        )

    ordered = sorted(recommendations, key=lambda item: float(item.get("score") or 0), reverse=True)[: payload.limit]
    return {
        "payer_id": payload.payer_id,
        "physician_npi": payload.physician_npi,
        "input_icd10_codes": icd10_codes,
        "inferred_from_icd10": {"hcpcs_codes": inferred_codes, "source": inferred_source},
        "recommendations": ordered,
    }

@app.post("/orders", status_code=201)
async def create_order(
    payload: OrderCreate,
    request: Request,
    user: dict = Depends(require_permissions("create_orders")),
):
    org_id = str(user["org_id"])
    raw_idem = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
    idem = _normalize_text(raw_idem).strip()[:128] if raw_idem else ""
    data_key = f"order:create:{org_id}:{idem}" if idem else ""
    lock_key = f"order:create:lock:{org_id}:{idem}" if idem else ""
    redis = get_redis(request) if idem else None

    if idem and redis:
        try:
            existing_raw = await redis.get(data_key)
            if existing_raw:
                existing_id = (
                    existing_raw.decode()
                    if isinstance(existing_raw, (bytes, bytearray))
                    else str(existing_raw)
                )
                db = request.app.state.db_pool
                async with db.connection() as conn:
                    row = await fetch_one(
                        conn,
                        "SELECT assigned_to, status FROM orders WHERE id = $1 AND org_id = $2",
                        existing_id,
                        org_id,
                    )
                if row:
                    return {
                        "order_id": existing_id,
                        "status": str(row.get("status") or "draft"),
                        "assigned_to": row.get("assigned_to"),
                        "idempotent_replay": True,
                    }
        except Exception as exc:
            logger.warning("Order create idempotency read failed (continuing without): %s", exc)

        try:
            got_lock = await redis.set(lock_key, "1", nx=True, ex=45)
        except Exception as exc:
            got_lock = True
            logger.warning("Order create idempotency lock unavailable: %s", exc)
        if not got_lock:
            for _ in range(40):
                await asyncio.sleep(0.05)
                try:
                    existing_raw = await redis.get(data_key)
                    if existing_raw:
                        existing_id = (
                            existing_raw.decode()
                            if isinstance(existing_raw, (bytes, bytearray))
                            else str(existing_raw)
                        )
                        db = request.app.state.db_pool
                        async with db.connection() as conn:
                            row = await fetch_one(
                                conn,
                                "SELECT assigned_to, status FROM orders WHERE id = $1 AND org_id = $2",
                                existing_id,
                                org_id,
                            )
                        if row:
                            return {
                                "order_id": existing_id,
                                "status": str(row.get("status") or "draft"),
                                "assigned_to": row.get("assigned_to"),
                                "idempotent_replay": True,
                            }
                except Exception:
                    break
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another request is creating an order with this Idempotency-Key; retry shortly.",
            )

    order_id = str(uuid.uuid4())
    db = request.app.state.db_pool
    try:
        async with db.connection() as conn:
            assigned_to = await _resolve_assignee(
                conn,
                org_id,
                preferred_user_id=payload.assigned_to,
                role_hint="intake",
                seed=f"{payload.patient_id}:{payload.payer_id}:{','.join(payload.hcpcs_codes)}",
            )
            iv, ipc, isrc = _infer_catalog_metadata(payload.hcpcs_codes)
            vertical = _normalize_text(payload.vertical) or iv
            product_category = _normalize_text(payload.product_category) or ipc
            source_cat = _normalize_text(payload.source) or isrc
            await exec_write(
                conn,
                """
                INSERT INTO orders (id, org_id, patient_id, assigned_to, hcpcs_codes, referring_physician_npi,
                    payer_id, insurance_auth_number, notes, priority, status, source_channel, source_reference,
                    intake_payload, created_by, vertical, product_category, source)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12,$13,$14,$15,$16,$17)
                """,
                order_id,
                org_id,
                payload.patient_id,
                assigned_to,
                json.dumps(payload.hcpcs_codes),
                payload.referring_physician_npi,
                payload.payer_id,
                payload.insurance_auth_number,
                payload.notes,
                payload.priority,
                _normalize_text(payload.source_channel) or "manual",
                payload.source_reference,
                json.dumps(payload.intake_payload or {}),
                user["sub"],
                vertical,
                product_category,
                source_cat,
            )
            await _seed_order_line_items_from_hcpcs(conn, order_id, payload.hcpcs_codes)
            await audit_log(
                conn,
                org_id,
                user["sub"],
                "create",
                "orders",
                resource_id=order_id,
                ip_address=_client_ip(request),
            )
            await _record_workflow_event(
                conn,
                org_id,
                "order.created",
                {
                    "order_id": order_id,
                    "patient_id": payload.patient_id,
                    "payer_id": payload.payer_id,
                    "hcpcs_codes": payload.hcpcs_codes,
                    "source_channel": _normalize_text(payload.source_channel) or "manual",
                    "idempotency_key": idem or None,
                },
                order_id=order_id,
            )
            rpub = get_redis(request)
            await rpub.publish(
                "orders.created",
                json.dumps(
                    {
                        "order_id": order_id,
                        "org_id": org_id,
                        "hcpcs_codes": payload.hcpcs_codes,
                        "payer_id": payload.payer_id,
                        "assigned_to": assigned_to,
                    }
                ),
            )
    finally:
        if idem and redis:
            try:
                await redis.delete(lock_key)
            except Exception as exc:
                logger.warning("Idempotency lock release failed: %s", exc)

    if idem and redis:
        try:
            await redis.set(data_key, order_id, ex=86400)
        except Exception as exc:
            logger.warning("Failed to store order idempotency key (order was created): %s", exc)

    asyncio.create_task(_score_order_with_trident(request, org_id, order_id))
    return {"order_id": order_id, "status": "draft", "assigned_to": assigned_to}


@app.post("/orders/import", status_code=201)
async def import_orders(
    payload: OrdersImportRequest,
    request: Request,
    _: bool = Depends(require_internal_api_key()),
    user: dict = Depends(require_permissions("create_orders")),
):
    if not payload.orders:
        return {
            "created": 0,
            "failed": 0,
            "skipped_duplicate": 0,
            "patients_created": 0,
            "orders_created": 0,
            "results": [],
        }

    db = request.app.state.db_pool
    redis = get_redis(request)
    results: list[dict[str, Any]] = []
    patients_created = 0
    orders_created = 0
    duplicates_skipped = 0
    created_order_ids: list[str] = []

    async with db.connection() as conn:
        prepared: list[tuple[int, ImportOrderPayload, tuple[Any, ...], tuple[str, str, str, str, str, list[str], list[str]]]] = []
        for index, row in enumerate(payload.orders):
            try:
                key, ctx = await _import_row_dedup_context(conn, str(user["org_id"]), row)
                prepared.append((index, row, key, ctx))
            except Exception as exc:
                logger.exception("Bulk order import row failed during dedup prep: index=%s", index)
                results.append({"index": index, "status": "failed", "error": str(exc)})

        canonical: dict[tuple[Any, ...], tuple[int, ImportOrderPayload, tuple[str, str, str, str, str, list[str], list[str]]]] = {}
        for index, row, key, ctx in prepared:
            if key in canonical:
                duplicates_skipped += 1
                master_index, master_row, _master_ctx = canonical[key]
                dup_note = _normalize_text(row.notes)
                if dup_note:
                    prev = _normalize_text(master_row.notes)
                    master_row.notes = f"{prev}\n[dedup row {index}] {dup_note}" if prev else f"[dedup row {index}] {dup_note}"
                results.append(
                    {
                        "index": index,
                        "status": "skipped_duplicate",
                        "duplicate_of_index": master_index,
                        "dedup_reason": "same org + patient + payer + HCPCS + diagnosis",
                    }
                )
            else:
                canonical[key] = (index, row, ctx)

        for index, row, ctx in canonical.values():
            first_name, last_name, dob, insurance_id, payer_id, hcpcs_codes, diagnosis_codes = ctx
            try:
                norm = normalize_form_identity(first_name, last_name, dob, None)
                if not norm.normalization_complete:
                    results.append(
                        {"index": index, "status": "failed", "error": "invalid_patient_identity"},
                    )
                    continue
                outcome = await match_form_patient_for_intake(
                    conn, str(user["org_id"]), norm, fetch_one=fetch_one, fetch_all=fetch_all
                )
                if outcome.tier == MatchTier.UNCERTAIN:
                    results.append(
                        {"index": index, "status": "ambiguous_patient", "reason": outcome.reason},
                    )
                    continue
                patient_created = False
                if outcome.tier in (MatchTier.EXACT, MatchTier.STRONG) and outcome.patient_id:
                    patient_id = outcome.patient_id
                    if row.email:
                        await exec_write(
                            conn,
                            """
                            UPDATE patients
                            SET email = COALESCE(email, $1), updated_at = NOW()
                            WHERE id = $2 AND org_id = $3
                            """,
                            row.email,
                            patient_id,
                            user["org_id"],
                        )
                else:
                    patient_id = str(uuid.uuid4())
                    await exec_write(
                        conn,
                        """
                        INSERT INTO patients (id, org_id, first_name, last_name, dob, insurance_id,
                            payer_id, diagnosis_codes, phone, address, email, created_by)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                        """,
                        patient_id,
                        user["org_id"],
                        first_name,
                        last_name,
                        dob,
                        insurance_id,
                        payer_id,
                        json.dumps(diagnosis_codes),
                        None,
                        json.dumps({}),
                        row.email,
                        user["sub"],
                    )
                    await audit_log(
                        conn, user["org_id"], user["sub"], "create", "patients",
                        resource_id=patient_id, ip_address=_client_ip(request),
                    )
                    patients_created += 1
                    patient_created = True

                intake_payload_out: dict[str, Any] = dict(row.intake_payload or {})
                intake_payload_out["_import_diag_sig"] = diagnosis_codes

                existing_draft = await _import_find_existing_draft_duplicate(
                    conn,
                    str(user["org_id"]),
                    patient_id,
                    payer_id,
                    hcpcs_codes,
                    diagnosis_codes,
                )
                if existing_draft:
                    duplicates_skipped += 1
                    dup_note = _normalize_text(row.notes)
                    if dup_note:
                        prev = _normalize_text(existing_draft.get("notes"))
                        merged = f"{prev}\n[dedup existing draft] {dup_note}" if prev else f"[dedup existing draft] {dup_note}"
                        await exec_write(
                            conn,
                            """
                            UPDATE orders
                            SET notes = $1, updated_at = NOW()
                            WHERE id = $2::uuid AND org_id = $3::uuid
                            """,
                            merged,
                            str(existing_draft["id"]),
                            user["org_id"],
                        )
                    results.append({
                        "index": index,
                        "status": "skipped_duplicate",
                        "dedup_reason": "existing_draft_order",
                        "duplicate_of_order_id": str(existing_draft["id"]),
                    })
                    continue

                priority = _normalize_text(row.priority).lower() or "standard"
                if priority not in {"standard", "urgent", "stat"}:
                    priority = "standard"
                referring_npi = _normalize_text(row.referring_physician_npi or row.npi) or "1234567890"
                assigned_to = await _resolve_assignee(
                    conn,
                    user["org_id"],
                    preferred_user_id=row.assigned_to,
                    preferred_email=row.assigned_to_email,
                    role_hint="intake",
                    seed="|".join(
                        [
                            patient_id,
                            first_name,
                            last_name,
                            insurance_id,
                            payer_id,
                            ",".join(hcpcs_codes),
                        ]
                    ),
                )
                source_channel = _normalize_text(row.source_channel) or "import"
                source_reference = _normalize_text(row.source_reference) or None
                iv, ipc, isrc = _infer_catalog_metadata(hcpcs_codes)

                order_id = str(uuid.uuid4())
                await exec_write(
                    conn,
                    """
                    INSERT INTO orders (id, org_id, patient_id, assigned_to, hcpcs_codes, referring_physician_npi,
                        payer_id, insurance_auth_number, notes, priority, status, source_channel, source_reference,
                        intake_payload, created_by, vertical, product_category, source)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12,$13,$14,$15,$16,$17)
                    """,
                    order_id,
                    user["org_id"],
                    patient_id,
                    assigned_to,
                    json.dumps(hcpcs_codes),
                    referring_npi,
                    payer_id,
                    None,
                    row.notes,
                    priority,
                    source_channel,
                    source_reference,
                    json.dumps(intake_payload_out),
                    user["sub"],
                    iv,
                    ipc,
                    isrc,
                )
                await _seed_order_line_items_from_hcpcs(conn, order_id, hcpcs_codes)
                await _seed_order_diagnoses_from_codes(conn, order_id, diagnosis_codes)
                await audit_log(
                    conn, user["org_id"], user["sub"], "create", "orders",
                    resource_id=order_id, ip_address=_client_ip(request),
                )
                await redis.publish("orders.created", json.dumps({
                    "order_id": order_id,
                    "org_id": user["org_id"],
                    "hcpcs_codes": hcpcs_codes,
                    "payer_id": payer_id,
                    "assigned_to": assigned_to,
                    "source_channel": source_channel,
                }))
                await _import_apply_financial_snapshot(
                    conn,
                    str(user["org_id"]),
                    user["sub"],
                    order_id,
                    payer_id,
                    row,
                    hcpcs_codes,
                    diagnosis_codes,
                )
                orders_created += 1
                created_order_ids.append(order_id)
                results.append({
                    "index": index,
                    "status": "created",
                    "patient_id": patient_id,
                    "patient_created": patient_created,
                    "order_id": order_id,
                    "payer_id": payer_id,
                    "assigned_to": assigned_to,
                    "source_channel": source_channel,
                })
            except Exception as exc:
                logger.exception("Bulk order import row failed: index=%s", index)
                results.append({
                    "index": index,
                    "status": "failed",
                    "error": str(exc),
                })

    created = sum(1 for item in results if item["status"] == "created")
    failed = sum(1 for item in results if item["status"] == "failed")
    results.sort(key=lambda item: item.get("index", 0))
    for created_order_id in created_order_ids:
        asyncio.create_task(_score_order_with_trident(request, str(user["org_id"]), created_order_id))
    return {
        "created": created,
        "failed": failed,
        "skipped_duplicate": duplicates_skipped,
        "patients_created": patients_created,
        "orders_created": orders_created,
        "results": results,
    }


async def _queue_pending_trident_scores(request: Request, org_id: str, limit: int) -> dict[str, Any]:
    db = request.app.state.db_pool
    pending_statuses = [
        "intake",
        "eligibility_check",
        "documents_pending",
        "physician_signature",
        "pending_auth",
        "auth_approved",
        "ready_to_submit",
        "draft",
    ]
    bounded_limit = max(1, min(limit, 5000))
    async with db.connection() as conn:
        rows = await fetch_all(
            conn,
            """
            SELECT id, status
            FROM orders
            WHERE org_id = $1
              AND status = ANY($2::text[])
            ORDER BY updated_at DESC
            LIMIT $3
            """,
            org_id,
            pending_statuses,
            bounded_limit,
        )
    order_ids = [str(r["id"]) for r in rows]
    for order_id in order_ids:
        await _score_order_with_trident(request, org_id, order_id)
    return {
        "queued": len(order_ids),
        "processed": len(order_ids),
        "statuses": pending_statuses,
        "limit": bounded_limit,
    }


@app.post("/workflow/trident/score-pending")
async def score_pending_orders_with_trident(
    request: Request,
    limit: int = 500,
    user: dict = Depends(require_permissions("update_order_status")),
):
    return await _queue_pending_trident_scores(request, str(user["org_id"]), limit)


@app.post("/internal/trident/score-pending")
async def score_pending_orders_with_trident_internal(
    request: Request,
    org_id: str | None = None,
    limit: int = 500,
    _: bool = Depends(require_internal_api_key()),
):
    resolved_org_id = _normalize_text(org_id)
    if not resolved_org_id:
        db = request.app.state.db_pool
        async with db.connection() as conn:
            row = await fetch_one(
                conn,
                """
                SELECT org_id::text AS org_id
                FROM orders
                GROUP BY org_id
                ORDER BY COUNT(*) DESC
                LIMIT 1
                """,
            )
        if not row or not row.get("org_id"):
            return {"queued": 0, "statuses": [], "limit": max(1, min(limit, 5000))}
        resolved_org_id = str(row["org_id"])
    return await _queue_pending_trident_scores(request, resolved_org_id, limit)


@app.get("/orders")
async def list_orders(
    request: Request,
    user: dict = Depends(current_user),
    status_filter: OrderStatus | None = None,
    limit: int = 50,
    offset: int = 0,
):
    db = request.app.state.db_pool
    q = """
        SELECT o.id, o.status, o.priority, o.hcpcs_codes, o.payer_id,
               o.patient_id, p.first_name, p.last_name, p.dob,
               (p.first_name || ' ' || p.last_name) AS patient_name,
               py.name AS payer_name,
               o.assigned_to AS assigned_to_user_id,
               au.email AS assigned_email,
               au.first_name AS assigned_first_name,
               au.last_name AS assigned_last_name,
               o.source_channel, o.source_reference,
               o.created_at, o.updated_at,
               o.payment_date, o.paid_at,
               o.denial_category, o.denied_amount,
               o.total_billed, o.total_paid, o.paid_amount, o.billing_status,
               o.eligibility_status, o.swo_status,
               o.swo_document_id, o.cms1500_document_id, o.pod_document_id
        FROM orders o
        JOIN patients p ON p.id = o.patient_id
        LEFT JOIN payers py ON py.id = o.payer_id
        LEFT JOIN users au ON au.id = o.assigned_to
        WHERE o.org_id = $1
    """
    params: list = [user["org_id"]]
    if status_filter:
        q += " AND o.status = $2"
        params.append(status_filter.value)
    q += " ORDER BY o.created_at DESC LIMIT $" + str(len(params) + 1) + " OFFSET $" + str(len(params) + 2)
    params += [limit, offset]

    async with db.connection() as conn:
        rows = await fetch_all(conn, q, *params)
    orders = []
    for row in rows:
        item = dict(row)
        item["assigned_to"] = _display_assignee(item)
        orders.append(item)
    return {"orders": orders}


@app.patch("/orders/{order_id}/status")
async def update_order_status(
    order_id: str,
    new_status: OrderStatus,
    request: Request,
    user: dict = Depends(require_permissions("update_order_status")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        order = await fetch_one(
            conn,
            """
            SELECT id, status, eligibility_status, swo_status, paid_amount, payment_date, denial_category
            FROM orders
            WHERE id = $1 AND org_id = $2
            """,
            order_id,
            user["org_id"],
        )
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        blocked_reason = _validate_status_transition(dict(order), new_status)
        if blocked_reason:
            raise HTTPException(status_code=409, detail=blocked_reason)

        rowcount = await exec_write(
            conn,
            "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3",
            new_status.value, order_id, user["org_id"],
        )
        if rowcount > 0:
            await exec_write(
                conn,
                """
                INSERT INTO workflow_events (org_id, order_id, user_id, event_type, payload)
                VALUES ($1, $2, $3, 'status_changed', $4::jsonb)
                """,
                user["org_id"],
                order_id,
                user.get("sub"),
                json.dumps(
                    {
                        "from_status": order["status"],
                        "to_status": new_status.value,
                    }
                ),
            )
            has_days_in_status = await fetch_one(
                conn,
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'days_in_status'
                LIMIT 1
                """,
            )
            if has_days_in_status:
                await exec_write(
                    conn,
                    "UPDATE orders SET days_in_status = 0 WHERE id = $1 AND org_id = $2",
                    order_id,
                    user["org_id"],
                )
    if rowcount == 0:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"order_id": order_id, "status": new_status.value}


@app.patch("/orders/{order_id}/assign")
async def assign_order(
    order_id: str,
    payload: OrderAssignmentRequest,
    request: Request,
    user: dict = Depends(require_permissions("assign_orders")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        order = await fetch_one(
            conn,
            "SELECT id, patient_id, payer_id, hcpcs_codes FROM orders WHERE id = $1 AND org_id = $2",
            order_id,
            user["org_id"],
        )
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        assigned_to = await _resolve_assignee(
            conn,
            user["org_id"],
            preferred_user_id=payload.assigned_to,
            preferred_email=payload.assigned_to_email,
            role_hint="billing",
            seed="|".join(
                [
                    str(order["id"]),
                    str(order["patient_id"]),
                    _normalize_text(order.get("payer_id")),
                    ",".join(_coerce_json_list(order.get("hcpcs_codes"))),
                ]
            ),
        )

        rowcount = await exec_write(
            conn,
            "UPDATE orders SET assigned_to = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3",
            assigned_to,
            order_id,
            user["org_id"],
        )
        if rowcount == 0:
            raise HTTPException(status_code=404, detail="Order not found")

        assigned_user = None
        if assigned_to:
            assigned_user = await fetch_one(
                conn,
                "SELECT id, email, first_name, last_name FROM users WHERE id = $1",
                assigned_to,
            )

    return {
        "order_id": order_id,
        "assigned_to_user_id": assigned_to,
        "assigned_to": _display_assignee(dict(assigned_user or {})),
    }


@app.post("/workflow/orders/{order_id}/advance-from-intake")
async def advance_order_from_intake(
    order_id: str,
    payload: IntakeWorkflowRequest,
    request: Request,
    _: bool = Depends(require_internal_api_key()),
    user: dict = Depends(require_permissions("run_eligibility")),
):
    db = request.app.state.db_pool
    redis = get_redis(request)
    async with db.connection() as conn:
        context = await _fetch_order_context(conn, user["org_id"], order_id)
        if not context:
            raise HTTPException(status_code=404, detail="Order not found")

        eligibility = await _run_eligibility_workflow(conn, user["org_id"], order_id)
        assigned_user_id = context.get("assigned_to")
        patient_name = eligibility.get("patient_name") or "Patient"

        response: dict[str, Any] = {
            "order_id": order_id,
            "eligibility": eligibility,
            "next_step": "owner_review",
        }

        if eligibility["eligibility_status"] == "eligible" and payload.auto_request_swo:
            swo = await _request_swo_signature(conn, user["org_id"], order_id)
            await _create_notification(
                conn,
                user["org_id"],
                "swo_requested",
                "Coverage verified, SWO sent",
                f"{patient_name} verified through Availity. SWO signature request has been prepared for the physician.",
                {"order_id": order_id, "sign_url": swo.get("sign_url"), "request_id": swo.get("request_id")},
                user_id=assigned_user_id,
                order_id=order_id,
            )
            response["next_step"] = "awaiting_swo_signature"
            response["swo_request"] = swo
        else:
            await _create_notification(
                conn,
                user["org_id"],
                "eligibility_review",
                "Eligibility needs review",
                f"{patient_name} needs eligibility follow-up before SWO/order placement can continue.",
                {"order_id": order_id, "eligibility": eligibility},
                user_id=assigned_user_id,
                order_id=order_id,
            )
            response["next_step"] = "owner_review"

    await redis.publish("notifications.created", json.dumps({"order_id": order_id, "next_step": response["next_step"]}))
    return response


@app.post("/workflow/orders/{order_id}/request-swo")
async def request_swo(
    order_id: str,
    payload: SwoRequestPayload,
    request: Request,
    user: dict = Depends(require_permissions("request_signatures")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        swo = await _request_swo_signature(
            conn,
            user["org_id"],
            order_id,
            physician_email=payload.physician_email,
            physician_name=payload.physician_name,
        )
    return {"order_id": order_id, "swo_request": swo}


@app.post("/webhooks/dropbox-sign/swo")
async def dropbox_sign_swo_webhook(payload: SwoWebhookPayload, request: Request):
    db = request.app.state.db_pool
    redis = get_redis(request)

    # If a secret is configured, require it as a lightweight shared-secret guard.
    expected_secret = settings.dropbox_sign_webhook_secret
    if expected_secret and request.headers.get("X-Dropbox-Sign-Secret") != expected_secret:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    async with db.connection() as conn:
        order = await fetch_one(
            conn,
            "SELECT id, org_id, assigned_to, patient_id FROM orders WHERE id = $1",
            payload.order_id,
        )
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        account_manager_id = await _resolve_assignee(
            conn,
            str(order["org_id"]),
            preferred_email=payload.account_manager_email,
            preferred_user_id=str(order.get("assigned_to")) if order.get("assigned_to") else None,
            role_hint="billing",
            seed=payload.order_id,
        )
        hcpcs_codes = [code.upper() for code in payload.signed_items if _normalize_text(code)]

        await exec_write(
            conn,
            """
            UPDATE orders
            SET assigned_to = $1,
                hcpcs_codes = CASE WHEN $2::text <> '' THEN $3 ELSE hcpcs_codes END,
                swo_document_id = COALESCE($4, swo_document_id),
                swo_request_id = COALESCE($5, swo_request_id),
                swo_status = 'ingested',
                status = 'pending_auth',
                updated_at = NOW()
            WHERE id = $6
            """,
            account_manager_id,
            "yes" if hcpcs_codes else "",
            json.dumps(hcpcs_codes),
            payload.swo_document_id,
            payload.signature_request_id,
            payload.order_id,
        )
        await _record_workflow_event(
            conn,
            str(order["org_id"]),
            "swo.ingested",
            {
                "order_id": payload.order_id,
                "signature_request_id": payload.signature_request_id,
                "swo_document_id": payload.swo_document_id,
                "signed_items": hcpcs_codes,
                "event_type": payload.event_type,
                "signed_at": payload.signed_at,
            },
            order_id=payload.order_id,
        )
        await _create_notification(
            conn,
            str(order["org_id"]),
            "order_ready_to_place",
            "Signed SWO received",
            "Signed SWO has been ingested. Review the ordered items and place the order.",
            {
                "order_id": payload.order_id,
                "swo_document_id": payload.swo_document_id,
                "signed_items": hcpcs_codes,
            },
            user_id=account_manager_id,
            order_id=payload.order_id,
        )

    await redis.publish("notifications.created", json.dumps({"order_id": payload.order_id, "type": "order_ready_to_place"}))
    return {"status": "processed", "order_id": payload.order_id, "assigned_to_user_id": account_manager_id}


@app.get("/notifications")
async def list_notifications(
    request: Request,
    user: dict = Depends(current_user),
    limit: int = 50,
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        rows = await fetch_all(
            conn,
            """
            SELECT id, order_id, notification_type, title, message, payload, read_at, created_at
            FROM notifications
            WHERE org_id = $1 AND (user_id = $2 OR user_id IS NULL)
            ORDER BY created_at DESC
            LIMIT $3
            """,
            user["org_id"],
            user["sub"],
            limit,
        )
    return {"notifications": [dict(row) for row in rows]}


@app.get("/communications/feed")
async def get_communications_feed(
    request: Request,
    user: dict = Depends(current_user),
    limit: int = 40,
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        notifications = [dict(row) for row in await fetch_all(
            conn,
            """
            SELECT
                id::text,
                'notification' AS item_type,
                notification_type AS subtype,
                COALESCE(title, notification_type) AS title,
                message AS body,
                order_id::text AS order_id,
                payload,
                created_at,
                user_id::text AS actor_id,
                NULL::text AS actor_name
            FROM notifications
            WHERE org_id = $1 AND (user_id = $2 OR user_id IS NULL)
            ORDER BY created_at DESC
            LIMIT $3
            """,
            user["org_id"],
            user["sub"],
            limit,
        )]
        workflow = [dict(row) for row in await fetch_all(
            conn,
            """
            SELECT
                id::text,
                'workflow' AS item_type,
                event_type AS subtype,
                event_type AS title,
                COALESCE(payload->>'tracking_status', payload->>'next_step', payload->>'eligibility_status', 'Workflow event') AS body,
                order_id::text AS order_id,
                payload,
                created_at,
                NULL::text AS actor_id,
                NULL::text AS actor_name
            FROM workflow_events
            WHERE org_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            user["org_id"],
            limit,
        )]
        messages = [dict(row) for row in await fetch_all(
            conn,
            """
            SELECT
                m.id::text,
                'message' AS item_type,
                m.message_type AS subtype,
                CONCAT('#', m.channel) AS title,
                m.message AS body,
                m.order_id::text AS order_id,
                m.metadata AS payload,
                m.created_at,
                m.user_id::text AS actor_id,
                TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS actor_name
            FROM communications_messages m
            LEFT JOIN users u ON u.id = m.user_id
            WHERE m.org_id = $1
            ORDER BY m.created_at DESC
            LIMIT $2
            """,
            user["org_id"],
            limit,
        )]

    items = notifications + workflow + messages
    items.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return {"items": [_serialize(item) for item in items[:limit]]}


@app.post("/communications/messages", status_code=201)
async def create_communication_message(
    payload: CommunicationMessagePayload,
    request: Request,
    user: dict = Depends(require_permissions("communicate")),
):
    db = request.app.state.db_pool
    redis = get_redis(request)
    message_id = str(uuid.uuid4())
    clean_message = _normalize_text(payload.message)
    if not clean_message:
        raise HTTPException(status_code=400, detail="Message is required")

    async with db.connection() as conn:
        await exec_write(
            conn,
            """
            INSERT INTO communications_messages (id, org_id, user_id, order_id, channel, message_type, message, metadata)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            """,
            message_id,
            user["org_id"],
            user["sub"],
            payload.order_id,
            _normalize_text(payload.channel) or "ops",
            _normalize_text(payload.message_type) or "note",
            clean_message,
            json.dumps(payload.metadata or {}),
        )
        await _create_notification(
            conn,
            user["org_id"],
            "team_message",
            f"#{_normalize_text(payload.channel) or 'ops'} update",
            clean_message,
            {
                "message_id": message_id,
                "channel": _normalize_text(payload.channel) or "ops",
                "order_id": payload.order_id,
            },
            order_id=payload.order_id,
        )

    await redis.publish("communications.messages.created", json.dumps({
        "message_id": message_id,
        "channel": payload.channel,
        "order_id": payload.order_id,
    }))
    return {"id": message_id, "status": "created"}


@app.get("/integrations/status")
async def get_integrations_status(user: dict = Depends(current_user)):
    return {
        "email": {
            "configured": bool(
                (settings.smtp_host and settings.smtp_user and settings.smtp_password)
                or (settings.google_client_id and settings.google_client_secret and settings.google_refresh_token)
            ),
            "provider": "google_oauth" if settings.google_refresh_token else ("smtp" if settings.smtp_host else None),
            "from_address": settings.email_from_address or settings.smtp_user or None,
        },
        "calendar": {
            "configured": bool(settings.google_client_id and settings.google_client_secret and settings.google_refresh_token and settings.google_calendar_id),
            "provider": "google_calendar" if settings.google_calendar_id else None,
            "calendar_id": settings.google_calendar_id or None,
        },
        "in_app_push": {
            "configured": True,
            "sources": ["notifications", "workflow_events", "communications_messages", "tracking_updates"],
        },
    }


@app.patch("/orders/{order_id}/fulfillment")
async def update_order_fulfillment(
    order_id: str,
    payload: FulfillmentUpdatePayload,
    request: Request,
    user: dict = Depends(require_permissions("manage_fulfillment")),
):
    db = request.app.state.db_pool
    redis = get_redis(request)
    async with db.connection() as conn:
        context = await _fetch_order_context(conn, user["org_id"], order_id)
        if not context:
            raise HTTPException(status_code=404, detail="Order not found")

        await exec_write(
            conn,
            """
            UPDATE orders
            SET tracking_number = $1,
                tracking_carrier = $2,
                tracking_status = $3,
                tracking_url = $4,
                invoice_document_id = COALESCE($5, invoice_document_id),
                packing_sheet_document_id = COALESCE($6, packing_sheet_document_id),
                fulfillment_status = 'placed',
                updated_at = NOW()
            WHERE id = $7 AND org_id = $8
            """,
            payload.tracking_number,
            payload.tracking_carrier,
            payload.tracking_status,
            payload.tracking_url,
            payload.invoice_document_id,
            payload.packing_sheet_document_id,
            order_id,
            user["org_id"],
        )
        await _record_workflow_event(
            conn,
            user["org_id"],
            "fulfillment.placed",
            {
                "order_id": order_id,
                "tracking_number": payload.tracking_number,
                "tracking_status": payload.tracking_status,
                "invoice_document_id": payload.invoice_document_id,
                "packing_sheet_document_id": payload.packing_sheet_document_id,
            },
            order_id=order_id,
        )
        await _create_notification(
            conn,
            user["org_id"],
            "order_placed",
            "Order placed",
            "Tracking, invoice, and packing sheet have been attached to the patient file.",
            {
                "order_id": order_id,
                "tracking_number": payload.tracking_number,
                "tracking_url": payload.tracking_url,
            },
            user_id=context.get("assigned_to"),
            order_id=order_id,
        )

    await redis.publish("notifications.created", json.dumps({"order_id": order_id, "type": "order_placed"}))
    return {"status": "placed", "order_id": order_id, "tracking_number": payload.tracking_number}


@app.post("/webhooks/tracking")
async def tracking_webhook(payload: TrackingWebhookPayload, request: Request):
    db = request.app.state.db_pool
    redis = get_redis(request)
    async with db.connection() as conn:
        order = await fetch_one(
            conn,
            "SELECT id, org_id FROM orders WHERE id = $1",
            payload.order_id,
        )
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        delivered_at = None
        normalized_status = _normalize_text(payload.tracking_status).lower() or "in_transit"
        if "deliver" in normalized_status:
            delivered_at = _normalize_timestamp_string(payload.delivered_at)

        await exec_write(
            conn,
            """
            UPDATE orders
            SET tracking_number = $1,
                tracking_carrier = COALESCE($2, tracking_carrier),
                tracking_status = $3,
                tracking_url = COALESCE($4, tracking_url),
                delivered_at = COALESCE($5, delivered_at),
                fulfillment_status = CASE WHEN $6 = 'yes' THEN 'delivered' ELSE fulfillment_status END,
                updated_at = NOW()
            WHERE id = $7
            """,
            payload.tracking_number,
            payload.carrier,
            payload.tracking_status,
            payload.tracking_url,
            delivered_at,
            "yes" if delivered_at else "no",
            payload.order_id,
        )
        await _record_workflow_event(
            conn,
            str(order["org_id"]),
            "tracking.updated",
            {
                "order_id": payload.order_id,
                "tracking_number": payload.tracking_number,
                "tracking_status": payload.tracking_status,
                "delivered_at": delivered_at,
            },
            order_id=payload.order_id,
        )
        if delivered_at:
            await _schedule_pod_after_delivery(conn, str(order["org_id"]), payload.order_id)
            await _mark_billing_ready(conn, str(order["org_id"]), payload.order_id, "tracking_delivered")

    await redis.publish("workflow.tracking.updated", json.dumps({"order_id": payload.order_id, "tracking_status": payload.tracking_status}))
    return {"status": "processed", "order_id": payload.order_id, "tracking_status": payload.tracking_status}


@app.post("/orders/{order_id}/pod-received")
async def mark_pod_received(
    order_id: str,
    payload: PodReceiptPayload,
    request: Request,
    user: dict = Depends(require_permissions("manage_fulfillment")),
):
    db = request.app.state.db_pool
    redis = get_redis(request)
    async with db.connection() as conn:
        context = await _fetch_order_context(conn, user["org_id"], order_id)
        if not context:
            raise HTTPException(status_code=404, detail="Order not found")

        received_at = _normalize_timestamp_string(payload.received_at)
        await exec_write(
            conn,
            """
            UPDATE orders
            SET pod_document_id = COALESCE($1, pod_document_id),
                pod_status = 'received',
                pod_received_at = $2,
                updated_at = NOW()
            WHERE id = $3 AND org_id = $4
            """,
            payload.pod_document_id,
            received_at,
            order_id,
            user["org_id"],
        )
        await _record_workflow_event(
            conn,
            user["org_id"],
            "pod.received",
            {"order_id": order_id, "pod_document_id": payload.pod_document_id, "received_at": received_at},
            order_id=order_id,
        )
        await _mark_billing_ready(conn, user["org_id"], order_id, "pod_received")

    await redis.publish("notifications.created", json.dumps({"order_id": order_id, "type": "billing_ready"}))
    return {"status": "billing_ready", "order_id": order_id}


@app.get("/billing/review-queue")
async def get_billing_review_queue(
    request: Request,
    user: dict = Depends(require_permissions("submit_claims")),
    limit: int = 100,
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        rows = await fetch_all(
            conn,
            """
            SELECT o.id, o.status, o.billing_status, o.billing_ready_at, o.tracking_number,
                   o.invoice_document_id, o.packing_sheet_document_id, o.pod_document_id,
                   p.first_name, p.last_name, p.email, p.insurance_id,
                   au.email AS assigned_email
            FROM orders o
            JOIN patients p ON p.id = o.patient_id
            LEFT JOIN users au ON au.id = o.assigned_to
            WHERE o.org_id = $1
              AND o.billing_status = 'ready_for_scrub'
            ORDER BY o.billing_ready_at DESC NULLS LAST, o.updated_at DESC
            LIMIT $2
            """,
            user["org_id"],
            limit,
        )
    return {"orders": [dict(row) for row in rows]}


@app.post("/billing/review-queue/{order_id}/approve")
async def approve_billing_review(
    order_id: str,
    payload: BillingReviewPayload,
    request: Request,
    user: dict = Depends(require_permissions("submit_claims")),
):
    db = request.app.state.db_pool
    redis = get_redis(request)
    async with db.connection() as conn:
        context = await _fetch_order_context(conn, user["org_id"], order_id)
        if not context:
            raise HTTPException(status_code=404, detail="Order not found")

        next_status = "queued_for_api" if payload.route == "api" else "queued_for_third_party"
        await exec_write(
            conn,
            """
            UPDATE orders
            SET billing_status = $1,
                updated_at = NOW(),
                notes = COALESCE(notes, '') || CASE WHEN $2 <> '' THEN E'\n[BILLING SCRUB] ' || $2 ELSE '' END
            WHERE id = $3 AND org_id = $4
            """,
            next_status,
            payload.reviewer_notes or "",
            order_id,
            user["org_id"],
        )
        await _record_workflow_event(
            conn,
            user["org_id"],
            "billing.scrubbed",
            {"order_id": order_id, "route": payload.route, "reviewer_notes": payload.reviewer_notes},
            order_id=order_id,
        )
        await _create_notification(
            conn,
            user["org_id"],
            "billing_scrubbed",
            "Billing scrub complete",
            f"Claim package scrubbed and routed to {'API billing' if payload.route == 'api' else 'third-party billing'}.",
            {"order_id": order_id, "route": payload.route},
            user_id=context.get("assigned_to"),
            order_id=order_id,
        )

    await redis.publish("notifications.created", json.dumps({"order_id": order_id, "type": "billing_scrubbed"}))
    return {"order_id": order_id, "billing_status": next_status}


@app.get("/orders/{order_id}/patient-record")
async def get_order_patient_record(
    order_id: str,
    request: Request,
    user: dict = Depends(current_user),
):
    """CRM: Return patient + order summary and document refs (DMEs, SWO, POD, CMS-1500) for full record PDF link."""
    db = request.app.state.db_pool
    async with db.connection() as conn:
        order = await fetch_one(
            conn,
            """
            SELECT o.id, o.patient_id, o.status, o.hcpcs_codes, o.payer_id,
                   o.created_at, o.updated_at, o.swo_document_id, o.cms1500_document_id, o.pod_document_id,
                   o.invoice_document_id, o.packing_sheet_document_id, o.tracking_number, o.tracking_carrier,
                   o.tracking_status, o.tracking_url, o.delivered_at, o.fulfillment_status,
                   o.pod_status, o.billing_status, o.billing_ready_at
            FROM orders o
            WHERE o.id = $1 AND o.org_id = $2
            """,
            order_id,
            user["org_id"],
        )
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        patient = await fetch_one(
            conn,
            "SELECT id, first_name, last_name, dob, email, insurance_id FROM patients WHERE id = $1 AND org_id = $2",
            order["patient_id"],
            user["org_id"],
        )
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
    record_pdf_url = f"/api/documents/patient-record-pdf?order_id={order_id}"
    return {
        "order_id": str(order["id"]),
        "patient_id": str(patient["id"]),
        "patient_name": f"{patient.get('first_name', '')} {patient.get('last_name', '')}".strip(),
        "patient_email": patient.get("email"),
        "order_summary": {
            "status": order["status"],
            "hcpcs_codes": order.get("hcpcs_codes") or [],
            "created_at": order.get("created_at"),
            "updated_at": order.get("updated_at"),
            "fulfillment_status": order.get("fulfillment_status"),
            "pod_status": order.get("pod_status"),
            "billing_status": order.get("billing_status"),
        },
        "documents": {
            "swo_document_id": order.get("swo_document_id"),
            "cms1500_document_id": order.get("cms1500_document_id"),
            "pod_document_id": order.get("pod_document_id"),
            "invoice_document_id": order.get("invoice_document_id"),
            "packing_sheet_document_id": order.get("packing_sheet_document_id"),
        },
        "shipping": {
            "tracking_number": order.get("tracking_number"),
            "tracking_carrier": order.get("tracking_carrier"),
            "tracking_status": order.get("tracking_status"),
            "tracking_url": order.get("tracking_url"),
            "delivered_at": order.get("delivered_at"),
        },
        "billing": {
            "billing_status": order.get("billing_status"),
            "billing_ready_at": order.get("billing_ready_at"),
        },
        "record_pdf_url": record_pdf_url,
    }


@app.get("/documents/patient-record-pdf")
async def get_patient_record_pdf(
    order_id: str,
    request: Request,
    user: dict = Depends(current_user),
):
    """CRM: Full patient record PDF (DMEs, POD, SWO, order tracked). Placeholder until PDF generation is implemented."""
    from fastapi.responses import JSONResponse
    db = request.app.state.db_pool
    async with db.connection() as conn:
        order = await fetch_one(
            conn,
            "SELECT id, patient_id, swo_document_id, cms1500_document_id, pod_document_id FROM orders WHERE id = $1 AND org_id = $2",
            order_id,
            user["org_id"],
        )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return JSONResponse(
        status_code=501,
        content={
            "message": "Full patient record PDF generation is coming soon.",
            "description": "The combined PDF will include: patient demographics, DMEs ordered, SWO, proof of delivery (POD), CMS-1500, and order tracking.",
            "order_id": order_id,
            "documents_available": {
                "swo": bool(order.get("swo_document_id")),
                "cms1500": bool(order.get("cms1500_document_id")),
                "pod": bool(order.get("pod_document_id")),
            },
        },
    )


# ---------------------------------------------------------------------------
# Denials Routes
# ---------------------------------------------------------------------------

@app.post("/denials", status_code=201)
async def record_denial(
    payload: DenialCreate,
    request: Request,
    user: dict = Depends(require_permissions("manage_denials")),
):
    denial_id = str(uuid.uuid4())
    db = request.app.state.db_pool
    async with db.connection() as conn:
        order_ctx = await _fetch_order_learning_context(conn, user["org_id"], payload.order_id)
        payer_id = (order_ctx or {}).get("payer_id") or (order_ctx or {}).get("patient_payer_id")
        await exec_write(
            conn,
            """
            INSERT INTO denials (id, org_id, order_id, payer_id, carc_code, rarc_code,
                denial_category, denial_date, denied_amount, payer_claim_number, notes, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            """,
            denial_id, user["org_id"], payload.order_id, payer_id, payload.carc_code,
            payload.rarc_code, payload.denial_category.value, payload.denial_date,
            payload.denied_amount, payload.payer_claim_number, payload.notes, user["sub"],
        )
        # Update order status
        await exec_write(
            conn,
            "UPDATE orders SET status = 'denied', denial_category = $1, denied_amount = $2, denial_date = $3, updated_at = NOW() WHERE id = $4",
            payload.denial_category.value, payload.denied_amount, payload.denial_date, payload.order_id,
        )
        await _record_learning_outcome(
            conn,
            org_id=user["org_id"],
            order_id=payload.order_id,
            paid_amount=0.0,
            claim_number=payload.payer_claim_number,
            is_denial=True,
            denial_reason=payload.denial_category.value,
            carc_code=payload.carc_code,
            rarc_code=payload.rarc_code,
            billed_amount=payload.denied_amount,
            created_by=user["sub"],
        )
        # Push to ML training queue
        redis = get_redis(request)
        await redis.publish("denials.recorded", json.dumps({
            "denial_id": denial_id,
            "order_id": payload.order_id,
            "carc_code": payload.carc_code,
            "denial_category": payload.denial_category.value,
            "denied_amount": payload.denied_amount,
        }))
        await redis.publish("trident.learning_events", json.dumps({
            "event_type": "denial_recorded",
            "order_id": payload.order_id,
            "org_id": user["org_id"],
            "denial_id": denial_id,
        }))
    return {"denial_id": denial_id, "status": "recorded"}


@app.get("/denials")
async def list_denials(
    request: Request,
    user: dict = Depends(require_permissions("view_denials")),
    category: DenialCategory | None = None,
    limit: int = 50,
    offset: int = 0,
):
    db = request.app.state.db_pool
    q = """
        SELECT d.*, o.hcpcs_codes, o.payer_id, p.first_name, p.last_name
        FROM denials d
        JOIN orders o ON o.id = d.order_id
        JOIN patients p ON p.id = o.patient_id
        WHERE d.org_id = $1
    """
    params: list = [user["org_id"]]
    if category:
        q += " AND d.denial_category = $2"
        params.append(category.value)
    q += " ORDER BY d.denial_date DESC LIMIT $" + str(len(params) + 1)
    params.append(limit)

    async with db.connection() as conn:
        rows = await fetch_all(conn, q, *params)
    return {"denials": [dict(r) for r in rows]}


@app.get("/appeals")
async def list_appeals(
    request: Request,
    user: dict = Depends(current_user),
    limit: int = 100,
    offset: int = 0,
):
    """Org-wide appeals for dashboards (win-rate, worklists)."""
    db = request.app.state.db_pool
    async with db.connection() as conn:
        rows = await fetch_all(
            conn,
            """
            SELECT a.*, o.patient_id, o.status AS order_status
            FROM appeals a
            LEFT JOIN orders o ON o.id = a.order_id AND o.org_id = a.org_id
            WHERE a.org_id = $1
            ORDER BY a.created_at DESC
            LIMIT $2 OFFSET $3
            """,
            user["org_id"],
            limit,
            offset,
        )
    return {"appeals": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# Payment Outcomes
# ---------------------------------------------------------------------------

@app.post("/outcomes", status_code=201)
async def record_outcome(
    payload: PaymentOutcome,
    request: Request,
    user: dict = Depends(require_permissions("record_payments")),
):
    outcome_id = str(uuid.uuid4())
    db = request.app.state.db_pool
    async with db.connection() as conn:
        recorded_id = await _record_learning_outcome(
            conn,
            org_id=user["org_id"],
            order_id=payload.order_id,
            paid_amount=payload.paid_amount,
            payment_date=payload.payment_date,
            eob_reference=payload.eob_reference,
            adjustment_codes=payload.adjustment_codes,
            created_by=user["sub"],
        )
        if not recorded_id:
            raise HTTPException(status_code=404, detail="Order not found")
        outcome_id = recorded_id
        await exec_write(
            conn,
            """
            UPDATE orders
            SET status = 'paid',
                paid_amount = $1,
                payment_date = $2,
                paid_at = NOW(),
                updated_at = NOW()
            WHERE id = $3
            """,
            payload.paid_amount,
            payload.payment_date,
            payload.order_id,
        )
        await audit_log(
            conn, user["org_id"], user["sub"], "create", "payment_outcomes",
            resource_id=outcome_id, ip_address=_client_ip(request),
        )
        redis = get_redis(request)
        await redis.publish("outcomes.recorded", json.dumps({
            "outcome_id": outcome_id,
            "order_id": payload.order_id,
            "paid_amount": payload.paid_amount,
        }))
        await redis.publish("trident.learning_events", json.dumps({
            "event_type": "payment_recorded",
            "order_id": payload.order_id,
            "org_id": user["org_id"],
            "outcome_id": outcome_id,
        }))
    return {"outcome_id": outcome_id}


# ---------------------------------------------------------------------------
# KPI Analytics
# ---------------------------------------------------------------------------

@app.get("/analytics/kpis")
async def get_kpis(
    request: Request,
    user: dict = Depends(require_permissions("view_analytics")),
    days: int = 30,
):
    db = request.app.state.db_pool
    since = datetime.now(timezone.utc) - timedelta(days=days)

    async with db.connection() as conn:
        # Volume
        volume = await fetch_one(
            conn,
            "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='denied') as denied FROM orders WHERE org_id=$1 AND created_at >= $2",
            user["org_id"], since,
        )

        # Revenue
        revenue = await fetch_one(
            conn,
            "SELECT COALESCE(SUM(paid_amount),0) as collected, COALESCE(SUM(denied_amount),0) as denied_revenue FROM orders WHERE org_id=$1 AND created_at >= $2",
            user["org_id"], since,
        )

        # Denial by category
        by_category = await fetch_all(
            conn,
            "SELECT denial_category, COUNT(*) as count FROM denials WHERE org_id=$1 AND denial_date >= $2 GROUP BY denial_category ORDER BY count DESC",
            user["org_id"], since.date(),
        )

        # Top CARC codes
        top_carc = await fetch_all(
            conn,
            "SELECT carc_code, COUNT(*) as count, SUM(denied_amount) as total_denied FROM denials WHERE org_id=$1 AND denial_date >= $2 GROUP BY carc_code ORDER BY count DESC LIMIT 10",
            user["org_id"], since.date(),
        )

    total = volume["total"] or 1
    denied = volume["denied"] or 0
    denial_rate = round(denied / total, 4)

    return {
        "period_days": days,
        "orders": {
            "total": total,
            "denied": denied,
            "denial_rate": denial_rate,
            "denial_rate_pct": f"{denial_rate * 100:.1f}%",
            "target_rate": settings.denial_threshold,
            "vs_industry_baseline": f"{(0.45 - denial_rate) * 100:+.1f}pp",
        },
        "revenue": {
            "collected": float(revenue["collected"]),
            "denied": float(revenue["denied_revenue"]),
        },
        "denial_breakdown": [dict(r) for r in by_category],
        "top_carc_codes": [dict(r) for r in top_carc],
    }


@app.get("/analytics/trends")
async def get_trends(
    request: Request,
    user: dict = Depends(require_permissions("view_analytics")),
    days: int = 90,
):
    db = request.app.state.db_pool
    since = datetime.now(timezone.utc) - timedelta(days=days)
    async with db.connection() as conn:
        rows = await fetch_all(
            conn,
            """
            SELECT DATE_TRUNC('week', created_at)::date as week,
                   COUNT(*) as total,
                   COUNT(*) FILTER (WHERE status='denied') as denied,
                   COUNT(*) FILTER (WHERE status='paid') as paid
            FROM orders
            WHERE org_id = $1 AND created_at >= $2
            GROUP BY week ORDER BY week
            """,
            user["org_id"], since,
        )
    return {"trends": [dict(r) for r in rows]}


@app.get("/worklist/protocols")
async def get_worklist_protocols(
    request: Request,
    user: dict = Depends(require_permissions("view_all_orders")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        rows = await fetch_all(
            conn,
            """
            SELECT o.id, o.patient_id, o.status, o.priority, o.hcpcs_codes, o.payer_id,
                   o.created_at, o.updated_at, o.denial_category, o.denied_amount, o.paid_amount,
                   p.first_name, p.last_name,
                   py.name AS payer_name, py.baseline_denial_rate,
                   d.appeal_deadline
            FROM orders o
            JOIN patients p ON p.id = o.patient_id
            LEFT JOIN payers py ON py.id = o.payer_id
            LEFT JOIN LATERAL (
                SELECT appeal_deadline
                FROM denials
                WHERE order_id = o.id
                ORDER BY denial_date DESC, created_at DESC
                LIMIT 1
            ) d ON true
            WHERE o.org_id = $1
              AND o.status NOT IN ('paid', 'closed', 'write_off')
            ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC
            """,
            user["org_id"],
        )

    protocols = [_build_outstanding_protocol(dict(row)) for row in rows]
    protocols.sort(
        key=lambda item: (
            {"urgent": 0, "warning": 1, "normal": 2}.get(item["priority"], 3),
            -item["days_in_stage"],
        )
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "live_database",
        "totals": {
            "outstanding_orders": len(protocols),
            "appeal_kill": len([p for p in protocols if p["protocol_type"] == "appeal_kill"]),
            "pre_submit_run": len([p for p in protocols if p["protocol_type"] == "pre_submit_run"]),
            "submission_run": len([p for p in protocols if p["protocol_type"] == "submission_run"]),
            "payment_watch": len([p for p in protocols if p["protocol_type"] == "payment_watch"]),
        },
        "protocols": protocols,
    }


# ---------------------------------------------------------------------------
# Availity Eligibility Proxy
# ---------------------------------------------------------------------------


@app.post("/eligibility/check")
async def check_eligibility_270(
    payload: Eligibility270Request,
    request: Request,
    user: dict = Depends(require_permissions("run_eligibility")),
):
    """
    Submit an X12 270 eligibility request to Availity and return raw 271 response.
    """
    try:
        result = await submit_eligibility_270(payload.edi_270, payload.correlation_id)
    except AvailityConfigError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Availity eligibility check failed: %s", e)
        raise HTTPException(status_code=502, detail="Availity eligibility check failed")

    parsed = {}
    if isinstance(result.get("body"), str) and result["status_code"] < 500:
        try:
            parsed = parse_271_basic(result["body"])
        except Exception as e:
            logger.warning("Failed to parse 271 response: %s", e)

    if payload.patient_id:
        db = request.app.state.db_pool
        async with db.connection() as conn:
            await _persist_eligibility_result(
                conn,
                patient_id=payload.patient_id,
                order_id=payload.order_id,
                payer_id=payload.payer_id,
                raw_result=result,
                parsed_summary=parsed,
            )

    return {
        "status_code": result["status_code"],
        "headers": result["headers"],
        "body": result["body"],
        "summary": parsed,
    }


def _build_270_from_records(
    patient: dict,
    order: dict | None,
    org_payer_id: str,
    service_date: str,
    *,
    edi_payer_name: str | None = None,
    edi_payer_pi: str | None = None,
) -> str:
    """Very basic X12 270 envelope using patient/order data."""
    now = datetime.now(timezone.utc)
    isa_date = now.strftime("%y%m%d")
    isa_time = now.strftime("%H%M")
    gs_date = now.strftime("%Y%m%d")
    gs_time = isa_time
    control_num = "000000001"
    trx_id = str(uuid.uuid4())[:12].replace("-", "")

    sender_id = settings.availity_sender_id[:15].ljust(15)
    receiver_id = settings.availity_receiver_id[:15].ljust(15)

    last = (patient.get("last_name") or "")[:35]
    first = (patient.get("first_name") or "")[:25]
    member_id = (patient.get("insurance_id") or "")[:20]
    dob = (patient.get("dob") or "").replace("-", "")

    provider_npi = ""
    if order and order.get("referring_physician_npi"):
        provider_npi = str(order["referring_physician_npi"])
    elif settings.availity_default_provider_npi:
        provider_npi = settings.availity_default_provider_npi

    segments: list[str] = []
    segments.append(
        f"ISA*00*          *00*          *ZZ*{sender_id}*ZZ*{receiver_id}*{isa_date}*{isa_time}*^*00501*{control_num}*0*T*:"
    )
    segments.append(
        f"GS*HS*{settings.availity_sender_id}*{settings.availity_receiver_id}*{gs_date}*{gs_time}*1*X*005010X279A1"
    )
    segments.append("ST*270*0001*005010X279A1")
    segments.append(f"BHT*0022*13*{trx_id}*{gs_date}*{gs_time}")
    nm_payer = (edi_payer_name or org_payer_id).strip() or org_payer_id
    pi_payer = (edi_payer_pi or org_payer_id).strip() or org_payer_id
    segments.append("HL*1**20*1")
    segments.append(f"NM1*PR*2*{nm_payer[:60]}*****PI*{pi_payer[:80]}")
    segments.append("HL*2*1*21*1")
    if provider_npi:
        segments.append(f"NM1*1P*2*PROVIDER*****XX*{provider_npi}")
    else:
        segments.append("NM1*1P*2*PROVIDER*****XX*0000000000")
    segments.append("HL*3*2*22*0")
    segments.append(f"NM1*IL*1*{last}*{first}****MI*{member_id}")
    if dob:
        segments.append(f"DMG*D8*{dob}*U")
    segments.append(f"DTP*291*D8*{service_date}")

    seg_count = len(segments) + 2  # include SE and GE/IEA?
    segments.append(f"SE*{seg_count}*0001")
    segments.append("GE*1*1")
    segments.append(f"IEA*1*{control_num}")

    return "~".join(segments) + "~"


def _build_270_simple(
    req: EligibilitySimpleRequest,
    *,
    edi_payer_name: str | None = None,
    edi_payer_pi: str | None = None,
) -> str:
    """Build a 270 directly from UI fields; optional mapped Availity NM1*PR name / PI."""
    now = datetime.now(timezone.utc)
    isa_date = now.strftime("%y%m%d")
    isa_time = now.strftime("%H%M")
    gs_date = now.strftime("%Y%m%d")
    gs_time = isa_time
    control_num = "000000001"
    trx_id = str(uuid.uuid4())[:12].replace("-", "")

    sender_id = settings.availity_sender_id[:15].ljust(15)
    receiver_id = settings.availity_receiver_id[:15].ljust(15)

    last = req.last_name[:35]
    first = req.first_name[:25]
    member_id = req.member_id[:20]
    dob = req.dob.replace("-", "")
    service_date = req.service_date or now.strftime("%Y%m%d")

    provider_npi = req.provider_npi or settings.availity_default_provider_npi or "0000000000"

    segments: list[str] = []
    segments.append(
        f"ISA*00*          *00*          *ZZ*{sender_id}*ZZ*{receiver_id}*{isa_date}*{isa_time}*^*00501*{control_num}*0*T*:"
    )
    segments.append(
        f"GS*HS*{settings.availity_sender_id}*{settings.availity_receiver_id}*{gs_date}*{gs_time}*1*X*005010X279A1"
    )
    segments.append("ST*270*0001*005010X279A1")
    segments.append(f"BHT*0022*13*{trx_id}*{gs_date}*{gs_time}")
    nm_payer = (edi_payer_name or req.payer_id).strip() or req.payer_id
    pi_payer = (edi_payer_pi or req.payer_id).strip() or req.payer_id
    segments.append("HL*1**20*1")
    segments.append(f"NM1*PR*2*{nm_payer[:60]}*****PI*{pi_payer[:80]}")
    segments.append("HL*2*1*21*1")
    segments.append(f"NM1*1P*2*PROVIDER*****XX*{provider_npi}")
    segments.append("HL*3*2*22*0")
    segments.append(f"NM1*IL*1*{last}*{first}****MI*{member_id}")
    if dob:
        segments.append(f"DMG*D8*{dob}*U")
    segments.append(f"DTP*291*D8*{service_date}")

    seg_count = len(segments) + 2
    segments.append(f"SE*{seg_count}*0001")
    segments.append("GE*1*1")
    segments.append(f"IEA*1*{control_num}")

    return "~".join(segments) + "~"


@app.post("/eligibility/check-from-order")
async def check_eligibility_from_order(
    payload: EligibilityFromOrderRequest,
    request: Request,
    user: dict = Depends(require_permissions("run_eligibility")),
):
    """
    Build an X12 270 from patient/order rows and submit to Availity.
    Returns the raw 271 plus the generated 270 for debugging.
    """
    db = request.app.state.db_pool
    order: dict | None = None
    edi_payer_name: str | None = None
    edi_payer_pi: str | None = None
    async with db.connection() as conn:
        patient = await fetch_one(
            conn,
            "SELECT id, first_name, last_name, dob, insurance_id, payer_id FROM patients WHERE id = $1 AND org_id = $2",
            payload.patient_id,
            user["org_id"],
        )
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        payer_id = patient.get("payer_id") or ""
        if payload.order_id:
            order = await fetch_one(
                conn,
                "SELECT id, payer_id, referring_physician_npi, hcpcs_codes FROM orders WHERE id = $1 AND org_id = $2",
                payload.order_id,
                user["org_id"],
            )
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")
            if order.get("payer_id"):
                payer_id = order["payer_id"]

        if payer_id:
            edi_payer_name, edi_payer_pi = await _fetch_availity_payer_edi(conn, str(payer_id))

    if not payer_id:
        raise HTTPException(status_code=400, detail="Missing payer_id on patient/order")

    if payload.service_date:
        service_date = payload.service_date
    else:
        service_date = datetime.now(timezone.utc).strftime("%Y%m%d")

    edi_270 = _build_270_from_records(
        patient,
        order,
        payer_id,
        service_date,
        edi_payer_name=edi_payer_name,
        edi_payer_pi=edi_payer_pi,
    )

    try:
        result = await submit_eligibility_270(edi_270, correlation_id=payload.order_id or payload.patient_id)
    except AvailityConfigError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Availity eligibility check-from-order failed: %s", e)
        raise HTTPException(status_code=502, detail="Availity eligibility check failed")

    return {
        "status_code": result["status_code"],
        "headers": result["headers"],
        "body": result["body"],
        "edi_270": edi_270,
    }


@app.post("/eligibility/check-simple")
async def check_eligibility_simple(
    payload: EligibilitySimpleRequest,
    request: Request,
    user: dict = Depends(require_permissions("run_eligibility")),
):
    """
    UI-friendly eligibility check:
    - Builds a 270 from simple fields (member ID, name, DOB, payer, NPI)
    - Submits to Availity
    - Returns a structured summary parsed from the 271
    """
    edi_name: str | None = None
    edi_pi: str | None = None
    db = request.app.state.db_pool
    async with db.connection() as conn:
        edi_name, edi_pi = await _fetch_availity_payer_edi(conn, payload.payer_id)
    edi_270 = _build_270_simple(
        payload,
        edi_payer_name=edi_name,
        edi_payer_pi=edi_pi,
    )

    try:
        result = await submit_eligibility_270(
            edi_270, correlation_id=payload.member_id
        )
    except AvailityConfigError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Availity eligibility check-simple failed: %s", e)
        raise HTTPException(status_code=502, detail="Availity eligibility check failed")

    parsed = {}
    if isinstance(result.get("body"), str) and result["status_code"] < 500:
        try:
            parsed = parse_271_basic(result["body"])
        except Exception as e:
            logger.warning("Failed to parse 271 response: %s", e)

    return {
        "status_code": result["status_code"],
        "summary": parsed,
        "edi_270": edi_270,
        "raw_271": result["body"],
    }


# ---------------------------------------------------------------------------
# Availity Billing (837 claim submission)
# ---------------------------------------------------------------------------


def _build_837_p_minimal(
    patient: dict,
    order: dict,
    service_date: str,
    billing_npi: str,
    billing_tin: str,
    *,
    edi_payer_name: str | None = None,
    edi_payer_pi: str | None = None,
) -> str:
    """Build a minimal X12 837 P (005010X222A1) from patient/order for Availity."""
    now = datetime.now(timezone.utc)
    isa_date = now.strftime("%y%m%d")
    isa_time = now.strftime("%H%M")
    gs_date = now.strftime("%Y%m%d")
    gs_time = isa_time
    control_num = "000000001"
    trx_ref = str(uuid.uuid4())[:9].replace("-", "")

    sender_id = (settings.availity_sender_id or "POSEIDON")[:15].ljust(15)
    receiver_id = (settings.availity_receiver_id or "AVAILITY")[:15].ljust(15)

    last = (patient.get("last_name") or "PATIENT")[:35]
    first = (patient.get("first_name") or "PATIENT")[:25]
    member_id = (patient.get("insurance_id") or "")[:20]
    dob = (patient.get("dob") or "").replace("-", "")
    internal_payer = (order.get("payer_id") or patient.get("payer_id") or "").strip()
    payer_pi = ((edi_payer_pi or internal_payer).strip() or internal_payer)[:80]
    payer_nm = ((edi_payer_name or internal_payer).strip() or internal_payer)[:60]
    provider_npi = (order.get("referring_physician_npi") or billing_npi or "0000000000").strip()[:10]
    hcpcs_list = order.get("hcpcs_codes") or []
    if isinstance(hcpcs_list, str):
        try:
            hcpcs_list = json.loads(hcpcs_list) if hcpcs_list else []
        except Exception:
            hcpcs_list = [hcpcs_list]
    hcpcs = (hcpcs_list[0] if hcpcs_list else "99213").upper()[:5]
    dx_list = patient.get("diagnosis_codes") or []
    if isinstance(dx_list, str):
        try:
            dx_list = json.loads(dx_list) if dx_list else []
        except Exception:
            dx_list = [dx_list]
    dx = (dx_list[0] if dx_list else "Z00").replace(".", "")[:7]

    claim_id = str(order.get("id", trx_ref))[:20]
    billed = "100.00"

    addr = patient.get("address") or {}
    street = (addr.get("street") or addr.get("line1") or "123 MAIN ST")[:55]
    city = (addr.get("city") or "ANYTOWN")[:30]
    state = (addr.get("state") or "TX")[:2]
    zip_code = (addr.get("zip") or addr.get("postal_code") or "75001")[:15]

    segments: list[str] = []
    segments.append(
        f"ISA*00*          *00*          *ZZ*{sender_id}*ZZ*{receiver_id}*{isa_date}*{isa_time}*^*00501*{control_num}*0*T*:"
    )
    segments.append(f"GS*HC*{settings.availity_sender_id}*{settings.availity_receiver_id}*{gs_date}*{gs_time}*1*X*005010X222A1")
    segments.append("ST*837*0001*005010X222A1")
    segments.append(f"BHT*0019*00*{trx_ref}*{gs_date}*{gs_time}*CH")
    segments.append("NM1*41*2*POSEIDON*****46*" + (billing_tin or "000000000").ljust(9)[:9])
    segments.append(f"NM1*40*2*{payer_nm[:35]}*****46*{payer_pi[:20]}")
    segments.append("HL*1**20*1")
    segments.append(f"NM1*85*2*BILLING PROVIDER*****XX*{provider_npi}")
    segments.append(f"N3*{street}")
    segments.append(f"N4*{city}*{state}*{zip_code}")
    segments.append("HL*2*1*22*0")
    segments.append(f"NM1*IL*1*{last}*{first}****MI*{member_id}")
    segments.append(f"N3*{street}")
    segments.append(f"N4*{city}*{state}*{zip_code}")
    segments.append(f"DMG*D8*{dob}*M")
    segments.append("HL*3*2*23*0")
    segments.append(f"NM1*QC*1*{last}*{first}")
    segments.append("HL*4*3*19*0")
    segments.append(f"CLM*{claim_id}*{billed}***11:B:1*Y*A*Y*Y")
    segments.append(f"DTP*472*D8*{service_date}")
    segments.append(f"HI*ABK:{dx}")
    segments.append(f"NM1*82*1*{last}*{first}****XX*{provider_npi}")
    segments.append(f"SV2*HC*{hcpcs}***1*UN*{billed}")
    segments.append(f"DTP*150*D8*{service_date}")

    seg_count = len(segments) + 1
    segments.append(f"SE*{seg_count}*0001")
    segments.append("GE*1*1")
    segments.append(f"IEA*1*{control_num}")

    return "~".join(segments) + "~"


async def submit_claim_for_order(
    request: Request,
    *,
    org_id: str,
    order_id: str,
    service_date: str | None,
) -> dict[str, Any]:
    """
    Single authoritative entry for order-based claim submission.
    Routes by orders.claim_strategy: AVAILITY -> Availity API + Core persistence; EDI -> EDI service.
    """
    correlation = getattr(request.state, "correlation_id", None)
    db_pool = request.app.state.db_pool
    async with db_pool.connection() as conn:
        row = await fetch_one(
            conn,
            "SELECT claim_strategy FROM orders WHERE id = $1 AND org_id = $2",
            order_id,
            org_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    strat_raw = row.get("claim_strategy")
    if strat_raw is None or not str(strat_raw).strip():
        raise HTTPException(
            status_code=409,
            detail="claim_strategy must be set to AVAILITY or EDI before submission",
        )
    strat = str(strat_raw).strip().upper()
    if strat not in ("AVAILITY", "EDI"):
        raise HTTPException(status_code=409, detail="Invalid claim_strategy on order")

    if strat == "AVAILITY":
        edi_payer_name: str | None = None
        edi_payer_pi: str | None = None
        async with db_pool.connection() as conn:
            async with conn.transaction():
                order, patient, edi_pair = await _load_order_patient_for_837_with_claim_lock(conn, org_id, order_id)
                edi_payer_name, edi_payer_pi = edi_pair

        svc = service_date or datetime.now(timezone.utc).strftime("%Y%m%d")
        billing_npi = settings.availity_default_provider_npi or (order.get("referring_physician_npi") or "0000000000")
        billing_tin = settings.availity_billing_tin or ""
        edi_837 = _build_837_p_minimal(
            dict(patient),
            dict(order),
            svc,
            billing_npi,
            billing_tin,
            edi_payer_name=edi_payer_name,
            edi_payer_pi=edi_payer_pi,
        )

        try:
            result = await submit_claim_837(
                edi_837,
                claim_type="professional",
                correlation_id=order_id,
            )
        except AvailityConfigError as e:
            raise HTTPException(status_code=500, detail=str(e))
        except Exception as e:
            logger.exception("Availity submit-claim-from-order failed: %s", e)
            raise HTTPException(status_code=502, detail="Availity claim submission failed")

        summary: dict[str, Any] = {}
        if isinstance(result.get("body"), str) and result["status_code"] < 500:
            body = result["body"].strip()
            if "ST*997" in body or body.startswith("ISA"):
                try:
                    summary = parse_997_basic(result["body"])
                except Exception as e:
                    logger.warning("Failed to parse 997: %s", e)

        async with db_pool.connection() as conn:
            await _persist_claim_submission(
                conn,
                org_id=org_id,
                order_id=order_id,
                payer_id=order.get("payer_id") or patient.get("payer_id"),
                submission_format="837p",
                submission_payload={
                    "correlation_id": order_id,
                    "claim_type": "professional",
                    "service_date": svc,
                    "edi_837": edi_837,
                },
                acknowledgment_payload={
                    "status_code": result["status_code"],
                    "body": result["body"],
                    "summary": summary,
                },
            )
        redis = get_redis(request)
        await redis.publish(
            "trident.learning_events",
            json.dumps({
                "event_type": "claim_submitted",
                "order_id": order_id,
                "org_id": org_id,
            }),
        )
        logger.info(
            "claim_submitted_availity order_id=%s org=%s correlation_id=%s",
            order_id,
            org_id,
            correlation,
        )
        return {
            "status_code": result["status_code"],
            "order_id": order_id,
            "summary": summary,
            "edi_837": edi_837,
            "raw_response": result["body"],
        }

    edi_base = (settings.edi_api_url or "").strip().rstrip("/")
    if not edi_base:
        raise HTTPException(status_code=503, detail="EDI_API_URL is not configured on Core")
    headers: dict[str, str] = {"X-Internal-API-Key": settings.internal_api_key}
    if correlation:
        headers["X-Correlation-ID"] = correlation
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(f"{edi_base}/api/v1/claims/submit/{order_id}", headers=headers)
    except Exception as e:
        logger.exception("EDI claim proxy failed: %s", e)
        raise HTTPException(status_code=502, detail="EDI service unreachable") from e
    try:
        payload = r.json()
    except Exception:
        payload = {"detail": r.text[:500]}
    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=payload)
    logger.info(
        "claim_submitted_edi_proxied order_id=%s org=%s correlation_id=%s http_status=%s",
        order_id,
        org_id,
        correlation,
        r.status_code,
    )
    return payload if isinstance(payload, dict) else {"result": payload}


@app.post("/billing/submit-claim")
async def billing_submit_claim(
    payload: ClaimSubmitRequest,
    request: Request,
    user: dict = Depends(require_permissions("submit_claims")),
):
    """
    Submit a raw X12 837 (P, I, or D) to Availity. Returns raw response (often 997).
    """
    correlation = getattr(request.state, "correlation_id", None)
    if payload.order_id:
        db = request.app.state.db_pool
        async with db.connection() as conn:
            await _precheck_order_for_claim_submission(conn, str(user["org_id"]), payload.order_id)
        logger.info(
            "billing_submit_claim_begin order_id=%s org=%s correlation_id=%s",
            payload.order_id,
            user["org_id"],
            correlation,
        )
    try:
        result = await submit_claim_837(
            payload.edi_837,
            claim_type=payload.claim_type,
            correlation_id=payload.correlation_id,
        )
    except AvailityConfigError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Availity submit-claim failed: %s", e)
        raise HTTPException(status_code=502, detail="Availity claim submission failed")

    summary = {}
    if isinstance(result.get("body"), str) and result["status_code"] < 500:
        body = result["body"].strip()
        if "ST*997" in body or body.startswith("ISA"):
            try:
                summary = parse_997_basic(result["body"])
            except Exception as e:
                logger.warning("Failed to parse 997: %s", e)

    if payload.order_id:
        db = request.app.state.db_pool
        async with db.connection() as conn:
            await _persist_claim_submission(
                conn,
                org_id=user["org_id"],
                order_id=payload.order_id,
                payer_id=payload.payer_id,
                submission_format=f"837{payload.claim_type[:1].lower()}",
                submission_payload={
                    "correlation_id": payload.correlation_id,
                    "claim_type": payload.claim_type,
                    "edi_837": payload.edi_837,
                },
                acknowledgment_payload={
                    "status_code": result["status_code"],
                    "headers": result["headers"],
                    "body": result["body"],
                    "summary": summary,
                },
            )
        redis = get_redis(request)
        await redis.publish("trident.learning_events", json.dumps({
            "event_type": "claim_submitted",
            "order_id": payload.order_id,
            "org_id": user["org_id"],
        }))

    return {
        "status_code": result["status_code"],
        "headers": result["headers"],
        "body": result["body"],
        "summary": summary,
    }


@app.post("/billing/submit-claim-from-order")
async def billing_submit_claim_from_order(
    payload: ClaimFromOrderRequest,
    request: Request,
    user: dict = Depends(require_permissions("submit_claims")),
):
    """
    Authoritative order claim submission: routes by orders.claim_strategy (AVAILITY or EDI).
    """
    return await submit_claim_for_order(
        request,
        org_id=str(user["org_id"]),
        order_id=payload.order_id,
        service_date=payload.service_date,
    )


# ---------------------------------------------------------------------------
# Canonical /api/v1 compatibility layer
# ---------------------------------------------------------------------------

CANONICAL_STATUS_FLOW: dict[str, set[str]] = {
    "intake": {"eligibility_check", "documents_pending", "cancelled"},
    "eligibility_check": {"eligibility_failed", "pending_auth", "documents_pending", "ready_to_submit"},
    "eligibility_failed": {"eligibility_check", "cancelled"},
    "pending_auth": {"auth_approved", "auth_denied", "documents_pending"},
    "auth_approved": {"documents_pending", "ready_to_submit"},
    "auth_denied": {"appeal_pending", "cancelled"},
    "documents_pending": {"physician_signature", "ready_to_submit", "pending_auth"},
    "physician_signature": {"documents_pending", "ready_to_submit"},
    "ready_to_submit": {"submitted", "cancelled"},
    "submitted": {"pending_payment", "partial_payment", "denied"},
    "pending_payment": {"partial_payment", "paid", "denied"},
    "partial_payment": {"paid", "denied", "appeal_pending"},
    "denied": {"appeal_pending", "appeal_submitted", "closed"},
    "appeal_pending": {"appeal_submitted", "closed"},
    "appeal_submitted": {"paid", "denied", "closed"},
    "paid": {"closed"},
    "closed": set(),
    "cancelled": set(),
}


def _minio_client() -> Minio:
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def _public_minio_endpoint() -> str:
    return os.getenv("MINIO_PUBLIC_ENDPOINT", settings.minio_endpoint)


def _serialize(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize(v) for v in value]
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return str(value)
    return value


async def _ensure_bucket_exists() -> None:
    client = _minio_client()
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


async def _fetch_org_slug(conn, org_id: str) -> str:
    row = await fetch_one(conn, "SELECT slug FROM organizations WHERE id = $1", org_id)
    return (row or {}).get("slug") or "poseidon"


async def _generate_patient_mrn(conn, org_id: str) -> str:
    slug = await _fetch_org_slug(conn, org_id)
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    row = await fetch_one(
        conn,
        """
        SELECT COUNT(*) AS count
        FROM patients
        WHERE org_id = $1
          AND created_at::date = CURRENT_DATE
        """,
        org_id,
    )
    seq = int((row or {}).get("count") or 0) + 1
    return f"{slug.upper()}-{today}-{seq:04d}"


async def _generate_order_number(conn, org_id: str) -> str:
    slug = await _fetch_org_slug(conn, org_id)
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    row = await fetch_one(
        conn,
        """
        SELECT COUNT(*) AS count
        FROM orders
        WHERE org_id = $1
          AND created_at::date = CURRENT_DATE
        """,
        org_id,
    )
    seq = int((row or {}).get("count") or 0) + 1
    return f"{slug.upper()}-{today}-{seq:04d}"


async def _get_user_profile(conn, user_id: str, org_id: str) -> dict[str, Any] | None:
    row = await fetch_one(
        conn,
        """
        SELECT id, org_id, email, first_name, last_name, role, permissions,
               COALESCE(is_active, active, true) AS is_active, last_login, created_at
        FROM users
        WHERE id = $1 AND org_id = $2
        """,
        user_id,
        org_id,
    )
    if not row:
        return None
    profile = dict(row)
    profile["permissions_override"] = _normalize_permission_state(profile.get("permissions"))
    profile["effective_permissions"] = _effective_permissions(str(profile.get("role")), profile.get("permissions"))
    return profile


def _canonical_transition_is_valid(current_status: str, new_status: str) -> bool:
    current = (current_status or "intake").lower()
    target = (new_status or current).lower()
    if current == target:
        return True
    allowed = CANONICAL_STATUS_FLOW.get(current, set())
    return target in allowed


async def _fetch_order_bundle(conn, org_id: str, order_id: str) -> dict[str, Any] | None:
    order = await fetch_one(
        conn,
        """
        SELECT o.*,
               py.name AS payer_name,
               py.baseline_denial_rate AS payer_baseline_denial_rate,
               p.first_name AS patient_first_name,
               p.last_name AS patient_last_name,
               COALESCE(p.date_of_birth, p.dob) AS patient_dob,
               p.mrn,
               p.phone AS patient_phone,
               p.email AS patient_email,
               p.address,
               COALESCE(p.address->>'address_line1', p.address->>'line1') AS address_line1,
               COALESCE(p.address->>'address_line2', p.address->>'line2') AS address_line2,
               COALESCE(p.address->>'city', '') AS city,
               COALESCE(p.address->>'state', '') AS state,
               COALESCE(p.address->>'zip_code', p.address->>'zip', '') AS zip_code,
               ph.npi AS physician_npi,
               ph.first_name AS physician_first_name,
               ph.last_name AS physician_last_name,
               ph.specialty AS physician_specialty
        FROM orders o
        JOIN patients p ON p.id = o.patient_id
        LEFT JOIN payers py ON py.id = o.payer_id
        LEFT JOIN physicians ph ON ph.id = o.physician_id OR ph.npi = o.referring_physician_npi
        WHERE o.id = $1 AND o.org_id = $2
        """,
        order_id,
        org_id,
    )
    if not order:
        return None
    diagnoses = await fetch_all(
        conn,
        "SELECT * FROM order_diagnoses WHERE order_id = $1 ORDER BY sequence ASC, id ASC",
        order_id,
    )
    line_items = await fetch_all(
        conn,
        "SELECT * FROM order_line_items WHERE order_id = $1 ORDER BY id ASC",
        order_id,
    )
    documents = await fetch_all(
        conn,
        "SELECT * FROM order_documents WHERE order_id = $1 ORDER BY created_at DESC",
        order_id,
    )
    shipments = await fetch_all(
        conn,
        "SELECT * FROM shipments WHERE order_id = $1 ORDER BY created_at DESC",
        order_id,
    )
    insurance = await fetch_all(
        conn,
        "SELECT * FROM patient_insurances WHERE patient_id = $1 ORDER BY is_primary DESC, created_at ASC",
        order["patient_id"],
    )
    timeline = await fetch_all(
        conn,
        "SELECT * FROM workflow_events WHERE order_id = $1 ORDER BY created_at DESC",
        order_id,
    )
    payload = dict(order)
    payload["patient"] = {
        "id": str(order["patient_id"]),
        "mrn": order.get("mrn"),
        "first_name": order.get("patient_first_name"),
        "last_name": order.get("patient_last_name"),
        "date_of_birth": _serialize(order.get("patient_dob")),
        "phone": order.get("patient_phone"),
        "email": order.get("patient_email"),
        "address": order.get("address") or {
            "line1": order.get("address_line1"),
            "line2": order.get("address_line2"),
            "city": order.get("city"),
            "state": order.get("state"),
            "zip": order.get("zip_code"),
        },
        "insurances": [_serialize(dict(row)) for row in insurance],
    }
    payload["physician"] = {
        "id": _serialize(order.get("physician_id")),
        "npi": order.get("physician_npi") or order.get("referring_physician_npi"),
        "first_name": order.get("physician_first_name"),
        "last_name": order.get("physician_last_name"),
        "specialty": order.get("physician_specialty"),
    }
    payload["diagnoses"] = [_serialize(dict(row)) for row in diagnoses]
    payload["line_items"] = [_serialize(dict(row)) for row in line_items]
    payload["documents"] = [_serialize(dict(row)) for row in documents]
    payload["shipments"] = [_serialize(dict(row)) for row in shipments]
    payload["workflow_events"] = [_serialize(dict(row)) for row in timeline]
    return _serialize(payload)


def _patient_age_years(dob_val: Any) -> int:
    if dob_val is None:
        return 0
    if hasattr(dob_val, "year"):
        d = dob_val
    else:
        raw = str(dob_val)[:10]
        try:
            d = datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError:
            return 0
    today = datetime.now(timezone.utc).date()
    years = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
    return max(0, years)


def _diagnosis_pointer_letter(idx: int) -> str:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return letters[idx] if idx < len(letters) else str(idx + 1)


def _pdf_draw_wrapped(
    pdf: Any,
    text: str,
    x: float,
    y_start: float,
    max_width: int,
    line_height: float,
    font: str,
    size: float,
) -> float:
    """Draw wrapped lines; return final y (decreasing). New page when y too low."""
    from reportlab.pdfbase.pdfmetrics import stringWidth

    y = y_start
    pdf.setFont(font, size)
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            y -= line_height * 0.6
            continue
        words = line.split()
        buf: list[str] = []
        for w in words:
            trial = (" ".join(buf + [w]))[:500]
            if stringWidth(trial, font, size) <= max_width:
                buf.append(w)
            else:
                if buf:
                    pdf.drawString(x, y, " ".join(buf)[:200])
                    y -= line_height
                    if y < 72:
                        pdf.showPage()
                        y = 760
                        pdf.setFont(font, size)
                buf = [w]
        if buf:
            pdf.drawString(x, y, " ".join(buf)[:200])
            y -= line_height
            if y < 72:
                pdf.showPage()
                y = 760
                pdf.setFont(font, size)
    return y


def _render_pod_package_pdf(order: dict[str, Any]) -> bytes:
    """
    Final POD package: shipment context + CMS/DMEPOS documentation checklist + capture requirements +
    signature template + operational instructions for billing readiness.
    """
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    oid = order.get("order_number") or order.get("id")
    pdf.setTitle(f"POD-PACKAGE-{oid}")
    pat = order.get("patient") or {}
    addr = pat.get("address") or {}
    if isinstance(addr, str):
        try:
            addr = json.loads(addr)
        except json.JSONDecodeError:
            addr = {}
    line1 = addr.get("line1") or addr.get("address_line1") or ""
    line2 = addr.get("line2") or addr.get("address_line2") or ""
    city = addr.get("city") or ""
    state = addr.get("state") or ""
    zipc = addr.get("zip") or addr.get("zip_code") or ""
    ship_to = ", ".join(filter(None, [line1, line2, f"{city} {state} {zipc}".strip()]))

    shipments = list(order.get("shipments") or [])
    ship0 = shipments[0] if shipments else {}
    tracking = _normalize_text(order.get("tracking_number")) or _normalize_text(ship0.get("tracking_number"))
    carrier = _normalize_text(order.get("tracking_carrier")) or _normalize_text(ship0.get("carrier"))
    delivered_at = order.get("delivered_at") or ship0.get("delivered_at")
    fulfill = _normalize_text(order.get("fulfillment_status"))
    pod_stat = _normalize_text(order.get("pod_status"))

    hcpcs = ", ".join(_coerce_json_list(order.get("hcpcs_codes"))) or "See line items / order"

    y = 760
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(48, y, "POSEIDON — Proof of Delivery (POD) & CMS Documentation Package")
    y -= 22
    pdf.setFont("Helvetica", 10)
    pdf.drawString(48, y, f"Order: {oid}  ·  Status: {order.get('status') or 'N/A'}  ·  Fulfillment: {fulfill or 'N/A'}  ·  POD workflow: {pod_stat or 'N/A'}")
    y -= 16
    pdf.drawString(48, y, f"Patient: {pat.get('first_name', '')} {pat.get('last_name', '')}  ·  DOB: {pat.get('date_of_birth') or 'N/A'}  ·  MRN: {pat.get('mrn') or 'N/A'}")
    y -= 14
    pdf.drawString(48, y, f"Payer / member: {order.get('payer_id') or 'N/A'}  ·  Insurance ID on file: {pat.get('insurance_id') or 'N/A'}")
    y -= 14
    y = _pdf_draw_wrapped(pdf, f"Ship-to / service location: {ship_to or 'Complete address on file in patient record.'}", 48, y, 500, 13, "Helvetica", 10)
    y -= 6
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(48, y, "Delivery / logistics (verify before closing POD)")
    y -= 14
    pdf.setFont("Helvetica", 10)
    y = _pdf_draw_wrapped(
        pdf,
        f"Carrier: {carrier or '____________'}  ·  Tracking: {tracking or '____________'}  ·  "
        f"Delivered at (system): {delivered_at or '____________'}  ·  Tracking status: {order.get('tracking_status') or ship0.get('tracking_status') or '____________'}",
        48,
        y,
        500,
        13,
        "Helvetica",
        10,
    )
    y -= 10
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(48, y, "Items / HCPCS (must match delivery ticket & claim)")
    y -= 14
    pdf.setFont("Helvetica", 10)
    y = _pdf_draw_wrapped(pdf, hcpcs, 52, y, 480, 13, "Helvetica", 10)
    y -= 12

    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(48, y, "CMS-required delivery & documentation checklist")
    y -= 14
    y = _pdf_draw_wrapped(pdf, CMS_CHECKLIST_BODY, 48, y, 500, 12, "Helvetica", 9)

    y -= 8
    if y < 200:
        pdf.showPage()
        y = 760

    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(48, y, "POD capture template (complete at delivery)")
    y -= 14
    pdf.setFont("Helvetica", 10)
    y = _pdf_draw_wrapped(pdf, POD_TEMPLATE_BODY, 48, y, 500, 14, "Helvetica", 10)

    y -= 10
    if y < 220:
        pdf.showPage()
        y = 760

    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(48, y, "Staff instructions (Poseidon Core)")
    y -= 14
    staff = staff_instructions_for_order(str(order.get("id") or oid))
    y = _pdf_draw_wrapped(pdf, staff, 48, y, 500, 12, "Helvetica", 9)
    y -= 16
    pdf.setFont("Helvetica-Oblique", 8)
    pdf.drawString(
        48,
        max(56, y),
        f"Generated {datetime.now(timezone.utc).isoformat()} — {GUIDANCE_DISCLAIMER}",
    )
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def _render_order_pdf(order: dict[str, Any], doc_type: str) -> bytes:
    dt = (doc_type or "summary").lower()
    if dt == "pod":
        return _render_pod_package_pdf(order)

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    title = {"cms1500": "CMS-1500 Style Claim Review", "swo": "SWO / Order Summary", "order": "Order Package"}.get(
        dt, doc_type.upper()
    )
    pdf.setTitle(f"{dt} {order.get('order_number') or order.get('id')}")
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(48, 760, f"POSEIDON — {title}")
    pdf.setFont("Helvetica", 11)
    y = 730
    pat = order.get("patient") or {}
    lines = [
        f"Order: {order.get('order_number') or order.get('id')}",
        f"Patient: {pat.get('first_name', '')} {pat.get('last_name', '')}".strip(),
        f"MRN: {pat.get('mrn') or 'N/A'}",
        f"DOB: {pat.get('date_of_birth') or 'N/A'}",
        f"Phone: {pat.get('phone') or 'N/A'} · Email: {pat.get('email') or 'N/A'}",
        f"Status: {order.get('status')} · Payer: {order.get('payer_id') or 'N/A'}",
        f"Physician NPI: {order.get('physician', {}).get('npi') or order.get('referring_physician_npi') or 'N/A'}",
    ]
    for line in lines:
        pdf.drawString(48, y, line[:118])
        y -= 18

    dx_rows = list(order.get("diagnoses") or [])
    dx_sorted = sorted(dx_rows, key=lambda r: (r.get("sequence") or 0, str(r.get("id") or "")))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(48, y, "ICD-10 / Diagnosis pointers (Box 21 style)")
    y -= 16
    pdf.setFont("Helvetica", 10)
    for i, row in enumerate(dx_sorted[:12]):
        code = row.get("icd10_code") or ""
        ptr = _diagnosis_pointer_letter(i)
        prim = " (primary)" if row.get("is_primary") else ""
        pdf.drawString(52, y, f"  {ptr}. {code}{prim}")
        y -= 14
        if y < 120:
            pdf.showPage()
            y = 760

    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(48, y, "Service lines (HCPCS + diag pointer)")
    y -= 16
    pdf.setFont("Helvetica", 9)
    for item in (order.get("line_items") or [])[:24]:
        hcpcs = item.get("hcpcs_code") or ""
        units = item.get("units") or item.get("quantity") or ""
        ptr = item.get("diagnosis_pointer") or item.get("diag_pointer") or "A"
        pdf.drawString(52, y, f"  HCPCS {hcpcs}  units {units}  ptr {ptr}")
        y -= 12
        if y < 100:
            pdf.showPage()
            y = 760

    if dt == "cms1500":
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(48, y, "Billing review (CMS-1500 style)")
        y -= 16
        pdf.setFont("Helvetica", 10)
        hcpcs_flat = ", ".join(_coerce_json_list(order.get("hcpcs_codes"))) or "N/A"
        pdf.drawString(52, y, f"Procedure codes on order: {hcpcs_flat}")
        y -= 14
        pdf.drawString(52, y, "Verify POS, modifiers, and units before claim submission.")
        y -= 14

    pdf.setFont("Helvetica-Oblique", 9)
    pdf.drawString(48, max(72, y - 20), f"Generated {datetime.now(timezone.utc).isoformat()} · Doc type: {dt}")
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


PRIMARY_ORDER_DOC_COLUMNS: dict[str, str] = {
    "swo": "swo_document_id",
    "cms1500": "cms1500_document_id",
    "pod": "pod_document_id",
}

def _coerce_order_document_doc_type(raw: str) -> str:
    """
    Normalize upload doc_type for order_documents.doc_type (VARCHAR 50).
    DB constraint allows any non-empty trimmed label up to 50 chars (see init.sql + migration 013).
    """
    t = _normalize_text(raw).lower()
    if not t:
        return "other"
    return t[:50]


async def _link_order_primary_document(conn, org_id: str, order_id: str, doc_type: str, document_id: str) -> None:
    col = PRIMARY_ORDER_DOC_COLUMNS.get((doc_type or "").lower())
    if not col:
        return
    await exec_write(
        conn,
        f"UPDATE orders SET {col} = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3",
        document_id,
        order_id,
        org_id,
    )


async def _store_document(
    conn,
    org_id: str,
    order_id: str,
    doc_type: str,
    file_name: str,
    content: bytes,
    mime_type: str,
    metadata: dict[str, Any] | None = None,
    status_value: str = "generated",
) -> dict[str, Any]:
    try:
        await _ensure_bucket_exists()
    except S3Error as exc:
        logger.warning("MinIO bucket ensure failed bucket=%s: %s", settings.minio_bucket, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage is not available (bucket check failed).",
        ) from exc
    client = _minio_client()
    document_id = str(uuid.uuid4())
    storage_key = f"{org_id}/{order_id}/{document_id}/{file_name}"
    try:
        client.put_object(
            settings.minio_bucket,
            storage_key,
            io.BytesIO(content),
            length=len(content),
            content_type=mime_type,
        )
    except S3Error as exc:
        logger.warning(
            "MinIO put_object failed bucket=%s key=%s bytes=%s: %s",
            settings.minio_bucket,
            storage_key,
            len(content),
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage upload failed.",
        ) from exc
    await exec_write(
        conn,
        """
        INSERT INTO order_documents (
            id, order_id, org_id, doc_type, file_name, mime_type, file_size_bytes,
            storage_bucket, storage_key, status, metadata
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        """,
        document_id,
        order_id,
        org_id,
        doc_type,
        file_name,
        mime_type,
        len(content),
        settings.minio_bucket,
        storage_key,
        status_value,
        json.dumps(metadata or {}),
    )
    logger.info(
        "document_uploaded org=%s order_id=%s doc_id=%s doc_type=%s bytes=%s bucket=%s",
        org_id,
        order_id,
        document_id,
        doc_type,
        len(content),
        settings.minio_bucket,
    )
    return {
        "id": document_id,
        "order_id": order_id,
        "doc_type": doc_type,
        "file_name": file_name,
        "mime_type": mime_type,
        "file_size_bytes": len(content),
        "storage_bucket": settings.minio_bucket,
        "storage_key": storage_key,
        "status": status_value,
        "metadata": metadata or {},
    }


def _presigned_download_url(bucket: str, object_name: str) -> str:
    client = _minio_client()
    try:
        return client.presigned_get_object(bucket, object_name, expires=timedelta(hours=4))
    except Exception as exc:
        logger.exception("Failed to presign document download for %s/%s: %s", bucket, object_name, exc)
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Document download is temporarily unavailable.",
            )
        scheme = "https" if settings.minio_secure else "http"
        return f"{scheme}://{_public_minio_endpoint()}/{bucket}/{object_name}"


class V1InsurancePayload(BaseModel):
    payer_name: str
    payer_id: str | None = None
    member_id: str | None = None
    group_number: str | None = None
    subscriber_name: str | None = None
    subscriber_dob: str | None = None
    relationship: str = "self"
    is_primary: bool = True
    is_active: bool = True


class V1PatientPayload(BaseModel):
    mrn: str | None = None
    first_name: str
    last_name: str
    date_of_birth: str
    gender: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    territory_id: str | None = None
    insurances: list[V1InsurancePayload] = []


class V1DiagnosisPayload(BaseModel):
    icd10_code: str
    description: str | None = None
    is_primary: bool = False
    sequence: int = 1


class V1LineItemPayload(BaseModel):
    hcpcs_code: str
    modifier: str | None = None
    description: str | None = None
    quantity: int = 1
    unit_price: float | None = None
    billed_amount: float | None = None
    allowed_amount: float | None = None
    paid_amount: float | None = None


class V1OrderPayload(BaseModel):
    patient_id: str
    physician_id: str | None = None
    physician_npi: str | None = None
    assigned_rep_id: str | None = None
    product_category: str | None = None
    vertical: str | None = None
    source: str | None = None
    priority: str = "normal"
    territory_id: str | None = None
    place_of_service: str = "12"
    clinical_notes: str | None = None
    clinical_data: dict[str, Any] = {}
    total_billed: float | None = None
    total_allowed: float | None = None
    total_paid: float | None = None
    date_of_service: str | None = None
    status: str = "intake"
    diagnoses: list[V1DiagnosisPayload] = []
    line_items: list[V1LineItemPayload] = []


class V1OrderPatchPayload(BaseModel):
    status: str | None = None
    assigned_rep_id: str | None = None
    priority: str | None = None
    clinical_notes: str | None = None
    total_billed: float | None = None
    total_allowed: float | None = None
    total_paid: float | None = None
    claim_strategy: str | None = None

    @field_validator("claim_strategy")
    @classmethod
    def _validate_claim_strategy(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip().upper()
        if s not in ("AVAILITY", "EDI"):
            raise ValueError("claim_strategy must be AVAILITY or EDI")
        return s


class V1DocumentPatchPayload(BaseModel):
    status: str


@app.post("/api/v1/auth/login")
async def v1_login(payload: LoginRequest, request: Request):
    auth = await login(payload, request)
    db = request.app.state.db_pool
    email_key = _normalize_login_email(str(payload.email))
    async with db.connection() as conn:
        row = await fetch_one(
            conn,
            "SELECT org_id FROM users WHERE LOWER(TRIM(email)) = $1",
            email_key,
        )
    auth["org_id"] = str((row or {}).get("org_id") or "")
    return auth


@app.get("/api/v1/auth/me")
async def v1_auth_me(request: Request, user: dict = Depends(current_user)):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        profile = await _get_user_profile(conn, user["sub"], user["org_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return _serialize(profile)


@app.post("/api/v1/auth/request-reset")
async def v1_request_reset(payload: PasswordResetRequest, request: Request):
    return await request_password_reset(payload, request)


@app.post("/api/v1/auth/reset-password")
async def v1_reset_password(payload: PasswordResetConfirm, request: Request):
    return await reset_password(payload, request)


@app.get("/api/v1/admin/users")
async def v1_admin_list_users(request: Request, user: dict = Depends(require_permissions("manage_users"))):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        org = await fetch_one(
            conn,
            """
            SELECT id, name, slug, entity_type, settings
            FROM organizations
            WHERE id = $1
            """,
            user["org_id"],
        )
        rows = await fetch_all(
            conn,
            """
            SELECT id, org_id, email, first_name, last_name, role, territory_id, permissions,
                   COALESCE(is_active, active, true) AS is_active,
                   last_login, created_at
            FROM users
            WHERE org_id = $1
            ORDER BY created_at DESC, email ASC
            """,
            user["org_id"],
        )
    users_payload = []
    for row in rows:
        item = dict(row)
        item["permissions_override"] = _normalize_permission_state(item.get("permissions"))
        item["effective_permissions"] = _effective_permissions(str(item.get("role")), item.get("permissions"))
        users_payload.append(_serialize(item))
    return {
        "organization": _serialize(dict(org or {})),
        "users": users_payload,
        "permission_matrix": ROLE_PERMISSION_MATRIX,
        "all_permissions": _all_permissions(),
    }


@app.post("/api/v1/admin/users", status_code=201)
async def v1_admin_create_user(
    payload: UserCreate,
    request: Request,
    user: dict = Depends(require_permissions("manage_users")),
):
    db = request.app.state.db_pool
    user_id = str(uuid.uuid4())
    async with db.connection() as conn:
        existing = await fetch_one(conn, "SELECT id FROM users WHERE lower(email) = lower($1)", payload.email)
        if existing:
            raise HTTPException(status_code=409, detail="User already exists")
        await exec_write(
            conn,
            """
            INSERT INTO users (
                id, org_id, email, password_hash, first_name, last_name, role, territory_id, active, is_active, permissions
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,true,$9::jsonb)
            """,
            user_id,
            user["org_id"],
            payload.email,
            hash_password(payload.password),
            payload.first_name,
            payload.last_name,
            payload.role.value,
            payload.rep_id,
            _json_dump({
                "grant": payload.permissions_grant,
                "deny": payload.permissions_deny,
            }),
        )
        created = await fetch_one(
            conn,
            """
            SELECT id, org_id, email, first_name, last_name, role, territory_id, permissions,
                   COALESCE(is_active, active, true) AS is_active,
                   last_login, created_at
            FROM users
            WHERE id = $1 AND org_id = $2
            """,
            user_id,
            user["org_id"],
        )
        await audit_log(conn, user["org_id"], user["sub"], "create", "users", user_id, _client_ip(request))
    created_payload = dict(created or {"id": user_id, "email": payload.email, "role": payload.role.value, "permissions": {}})
    created_payload["permissions_override"] = _normalize_permission_state(created_payload.get("permissions"))
    created_payload["effective_permissions"] = _effective_permissions(
        str(created_payload.get("role")),
        created_payload.get("permissions"),
    )
    return _serialize(created_payload)


@app.patch("/api/v1/admin/users/{user_id}")
async def v1_admin_update_user(
    user_id: str,
    payload: AdminUserUpdate,
    request: Request,
    user: dict = Depends(require_permissions("manage_users")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        existing = await fetch_one(
            conn,
            """
            SELECT id, first_name, last_name, role, territory_id, permissions,
                   COALESCE(is_active, active, true) AS is_active
            FROM users
            WHERE id = $1 AND org_id = $2
            """,
            user_id,
            user["org_id"],
        )
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")
        next_first_name = payload.first_name if payload.first_name is not None else existing["first_name"]
        next_last_name = payload.last_name if payload.last_name is not None else existing["last_name"]
        next_role = payload.role.value if payload.role is not None else existing["role"]
        next_territory = payload.territory_id if payload.territory_id is not None else existing["territory_id"]
        next_active = payload.is_active if payload.is_active is not None else bool(existing["is_active"])
        next_permissions = _normalize_permission_state(existing.get("permissions"))
        if payload.permissions_grant is not None:
            next_permissions["grant"] = sorted({str(item).strip() for item in payload.permissions_grant if str(item).strip()})
        if payload.permissions_deny is not None:
            next_permissions["deny"] = sorted({str(item).strip() for item in payload.permissions_deny if str(item).strip()})
        await exec_write(
            conn,
            """
            UPDATE users
            SET first_name = $1,
                last_name = $2,
                role = $3,
                territory_id = $4,
                active = $5,
                is_active = $6,
                permissions = $7::jsonb
            WHERE id = $8 AND org_id = $9
            """,
            next_first_name,
            next_last_name,
            next_role,
            next_territory,
            next_active,
            next_active,
            _json_dump(next_permissions),
            user_id,
            user["org_id"],
        )
        updated = await fetch_one(
            conn,
            """
            SELECT id, org_id, email, first_name, last_name, role, territory_id, permissions,
                   COALESCE(is_active, active, true) AS is_active,
                   last_login, created_at
            FROM users
            WHERE id = $1 AND org_id = $2
            """,
            user_id,
            user["org_id"],
        )
        await audit_log(conn, user["org_id"], user["sub"], "update", "users", user_id, _client_ip(request))
    updated_payload = dict(updated or {})
    updated_payload["permissions_override"] = _normalize_permission_state(updated_payload.get("permissions"))
    updated_payload["effective_permissions"] = _effective_permissions(
        str(updated_payload.get("role")),
        updated_payload.get("permissions"),
    )
    return _serialize(updated_payload)


@app.patch("/api/v1/admin/users/{user_id}/password")
async def v1_admin_update_user_password(
    user_id: str,
    payload: UserPasswordUpdate,
    request: Request,
    user: dict = Depends(require_permissions("reset_passwords")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        rowcount = await exec_write(
            conn,
            """
            UPDATE users
            SET password_hash = $1
            WHERE id = $2 AND org_id = $3
            """,
            hash_password(payload.password),
            user_id,
            user["org_id"],
        )
        if rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        await audit_log(conn, user["org_id"], user["sub"], "password_reset", "users", user_id, _client_ip(request))
    return {"user_id": user_id, "status": "password_updated"}


@app.post("/api/v1/patients", status_code=201)
async def v1_create_patient(
    payload: V1PatientPayload,
    request: Request,
    user: dict = Depends(require_permissions("create_patients")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        norm = normalize_form_identity(
            payload.first_name,
            payload.last_name,
            payload.date_of_birth,
            payload.phone,
        )
        if not norm.normalization_complete:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Valid first name, last name, and date of birth are required.",
            )
        outcome = await match_form_patient_for_intake(
            conn, str(user["org_id"]), norm, fetch_one=fetch_one, fetch_all=fetch_all
        )
        if outcome.tier == MatchTier.UNCERTAIN:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Patient identity is ambiguous relative to existing records",
                    "reason": outcome.reason,
                },
            )
        if outcome.tier in (MatchTier.EXACT, MatchTier.STRONG) and outcome.patient_id:
            hit = await fetch_one(
                conn,
                "SELECT id, mrn FROM patients WHERE id = $1 AND org_id = $2",
                outcome.patient_id,
                user["org_id"],
            )
            if hit:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "Matching patient already exists",
                        "id": str(hit["id"]),
                        "mrn": hit.get("mrn"),
                        "match_tier": outcome.tier.value,
                    },
                )
        mrn = payload.mrn or await _generate_patient_mrn(conn, user["org_id"])
        existing = await fetch_one(
            conn,
            "SELECT id, mrn FROM patients WHERE org_id = $1 AND mrn = $2",
            user["org_id"],
            mrn,
        )
        if existing:
            raise HTTPException(status_code=409, detail="Patient MRN already exists")

        patient_id = str(uuid.uuid4())
        first_insurance = payload.insurances[0] if payload.insurances else None
        await exec_write(
            conn,
            """
            INSERT INTO patients (
                id, org_id, mrn, first_name, last_name, date_of_birth, dob, gender, phone, email,
                address_line1, address_line2, city, state, zip_code, territory_id,
                insurance_id, payer_id, address, created_by
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
            """,
            patient_id,
            user["org_id"],
            mrn,
            payload.first_name,
            payload.last_name,
            payload.date_of_birth,
            payload.date_of_birth,
            payload.gender,
            payload.phone,
            payload.email,
            payload.address_line1,
            payload.address_line2,
            payload.city,
            payload.state,
            payload.zip_code,
            payload.territory_id,
            first_insurance.member_id if first_insurance else None,
            first_insurance.payer_id if first_insurance else None,
            json.dumps(
                {
                    "line1": payload.address_line1,
                    "line2": payload.address_line2,
                    "city": payload.city,
                    "state": payload.state,
                    "zip": payload.zip_code,
                }
            ),
            user["sub"],
        )
        for insurance in payload.insurances:
            await exec_write(
                conn,
                """
                INSERT INTO patient_insurances (
                    id, patient_id, payer_name, payer_id, member_id, group_number,
                    subscriber_name, subscriber_dob, relationship, is_primary, is_active
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                """,
                str(uuid.uuid4()),
                patient_id,
                insurance.payer_name,
                insurance.payer_id,
                insurance.member_id,
                insurance.group_number,
                insurance.subscriber_name,
                insurance.subscriber_dob,
                insurance.relationship,
                insurance.is_primary,
                insurance.is_active,
            )
        await audit_log(conn, user["org_id"], user["sub"], "create", "patients", patient_id, _client_ip(request))
    return {"id": patient_id, "mrn": mrn}


@app.get("/api/v1/patients")
async def v1_list_patients(
    request: Request,
    user: dict = Depends(require_permissions("view_patients")),
    page: int = 1,
    page_size: int = 25,
    search: str | None = None,
):
    db = request.app.state.db_pool
    offset = max(page - 1, 0) * page_size
    params: list[Any] = [user["org_id"]]
    where = ["p.org_id = $1"]
    if search:
        params.append(f"%{search.strip().lower()}%")
        idx = len(params)
        where.append(f"(lower(p.first_name) LIKE ${idx} OR lower(p.last_name) LIKE ${idx} OR lower(coalesce(p.mrn,'')) LIKE ${idx})")
    query = f"""
        SELECT p.*, pi.payer_name, pi.payer_id AS insurance_payer_id, pi.member_id
        FROM patients p
        LEFT JOIN LATERAL (
            SELECT payer_name, payer_id, member_id
            FROM patient_insurances
            WHERE patient_id = p.id
            ORDER BY is_primary DESC, created_at ASC
            LIMIT 1
        ) pi ON true
        WHERE {' AND '.join(where)}
        ORDER BY p.created_at DESC
        LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
    """
    params.extend([page_size, offset])
    async with db.connection() as conn:
        rows = await fetch_all(conn, query, *params)
    return {
        "page": page,
        "page_size": page_size,
        "patients": [_serialize(dict(row)) for row in rows],
    }


@app.get("/api/v1/patients/{patient_id}")
async def v1_get_patient(patient_id: str, request: Request, user: dict = Depends(require_permissions("view_patients"))):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        patient = await fetch_one(conn, "SELECT * FROM patients WHERE id = $1 AND org_id = $2", patient_id, user["org_id"])
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        insurances = await fetch_all(conn, "SELECT * FROM patient_insurances WHERE patient_id = $1 ORDER BY is_primary DESC, created_at ASC", patient_id)
    result = dict(patient)
    result["insurances"] = [_serialize(dict(row)) for row in insurances]
    return _serialize(result)


@app.patch("/api/v1/patients/{patient_id}")
async def v1_update_patient(
    patient_id: str,
    payload: V1PatientPayload,
    request: Request,
    user: dict = Depends(require_permissions("update_patients")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        updated = await exec_write(
            conn,
            """
            UPDATE patients
            SET first_name = $1, last_name = $2, date_of_birth = $3, dob = $3, gender = $4,
                phone = $5, email = $6, address_line1 = $7, address_line2 = $8,
                city = $9, state = $10, zip_code = $11, territory_id = $12,
                address = $13, updated_at = NOW()
            WHERE id = $14 AND org_id = $15
            """,
            payload.first_name,
            payload.last_name,
            payload.date_of_birth,
            payload.gender,
            payload.phone,
            payload.email,
            payload.address_line1,
            payload.address_line2,
            payload.city,
            payload.state,
            payload.zip_code,
            payload.territory_id,
            json.dumps(
                {
                    "line1": payload.address_line1,
                    "line2": payload.address_line2,
                    "city": payload.city,
                    "state": payload.state,
                    "zip": payload.zip_code,
                }
            ),
            patient_id,
            user["org_id"],
        )
    if not updated:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"id": patient_id, "status": "updated"}


@app.get("/api/v1/patients/{patient_id}/insurances")
async def v1_list_patient_insurances(patient_id: str, request: Request, user: dict = Depends(require_permissions("view_patients"))):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        patient = await fetch_one(conn, "SELECT id FROM patients WHERE id = $1 AND org_id = $2", patient_id, user["org_id"])
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        rows = await fetch_all(conn, "SELECT * FROM patient_insurances WHERE patient_id = $1 ORDER BY is_primary DESC, created_at ASC", patient_id)
    return {"insurances": [_serialize(dict(row)) for row in rows]}


@app.post("/api/v1/patients/{patient_id}/insurances", status_code=201)
async def v1_add_patient_insurance(
    patient_id: str,
    payload: V1InsurancePayload,
    request: Request,
    user: dict = Depends(require_permissions("update_patients")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        patient = await fetch_one(conn, "SELECT id FROM patients WHERE id = $1 AND org_id = $2", patient_id, user["org_id"])
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        insurance_id = str(uuid.uuid4())
        await exec_write(
            conn,
            """
            INSERT INTO patient_insurances (
                id, patient_id, payer_name, payer_id, member_id, group_number,
                subscriber_name, subscriber_dob, relationship, is_primary, is_active
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            """,
            insurance_id,
            patient_id,
            payload.payer_name,
            payload.payer_id,
            payload.member_id,
            payload.group_number,
            payload.subscriber_name,
            payload.subscriber_dob,
            payload.relationship,
            payload.is_primary,
            payload.is_active,
        )
    return {"id": insurance_id}


@app.post("/api/v1/orders", status_code=201)
async def v1_create_order(
    payload: V1OrderPayload,
    request: Request,
    user: dict = Depends(require_permissions("create_orders")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        patient = await fetch_one(
            conn,
            "SELECT id, payer_id FROM patients WHERE id = $1 AND org_id = $2",
            payload.patient_id,
            user["org_id"],
        )
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        order_id = str(uuid.uuid4())
        order_number = await _generate_order_number(conn, user["org_id"])
        total_billed = payload.total_billed or sum((item.billed_amount or 0) for item in payload.line_items)
        total_allowed = payload.total_allowed or sum((item.allowed_amount or 0) for item in payload.line_items)
        total_paid = payload.total_paid or sum((item.paid_amount or 0) for item in payload.line_items)
        hcpcs_codes = [item.hcpcs_code for item in payload.line_items] if payload.line_items else []
        payer_id = payload.clinical_data.get("payer_id") if isinstance(payload.clinical_data, dict) else None
        if not payer_id:
            payer_id = patient.get("payer_id")
        if not payer_id:
            payer = await fetch_one(conn, "SELECT id FROM payers ORDER BY id ASC LIMIT 1")
            payer_id = str(payer["id"]) if payer else None
        await exec_write(
            conn,
            """
            INSERT INTO orders (
                id, org_id, order_number, patient_id, physician_id, referring_physician_npi, assigned_rep_id, assigned_to,
                status, product_category, vertical, source, source_channel, priority, territory_id,
                place_of_service, clinical_notes, notes, clinical_data, total_billed, total_allowed, total_paid,
                paid_amount, date_of_service, hcpcs_codes, payer_id, created_by
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
            """,
            order_id,
            user["org_id"],
            order_number,
            payload.patient_id,
            payload.physician_id,
            payload.physician_npi,
            payload.assigned_rep_id,
            payload.assigned_rep_id,
            payload.status,
            payload.product_category,
            payload.vertical,
            payload.source or "manual",
            payload.source or "manual",
            payload.priority,
            payload.territory_id,
            payload.place_of_service,
            payload.clinical_notes,
            payload.clinical_notes,
            json.dumps(payload.clinical_data),
            total_billed,
            total_allowed,
            total_paid,
            total_paid,
            payload.date_of_service,
            json.dumps(hcpcs_codes),
            payer_id,
            user["sub"],
        )
        for diagnosis in payload.diagnoses:
            await exec_write(
                conn,
                """
                INSERT INTO order_diagnoses (id, order_id, icd10_code, description, is_primary, sequence)
                VALUES ($1,$2,$3,$4,$5,$6)
                """,
                str(uuid.uuid4()),
                order_id,
                diagnosis.icd10_code,
                diagnosis.description,
                diagnosis.is_primary,
                diagnosis.sequence,
            )
        for item in payload.line_items:
            await exec_write(
                conn,
                """
                INSERT INTO order_line_items (
                    id, order_id, hcpcs_code, modifier, description, quantity,
                    unit_price, billed_amount, allowed_amount, paid_amount
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                """,
                str(uuid.uuid4()),
                order_id,
                item.hcpcs_code,
                item.modifier,
                item.description,
                item.quantity,
                item.unit_price,
                item.billed_amount,
                item.allowed_amount,
                item.paid_amount,
            )
        await _record_workflow_event(conn, user["org_id"], "order.created", {"order_id": order_id, "status": payload.status}, order_id=order_id)
    asyncio.create_task(_score_order_with_trident(request, str(user["org_id"]), order_id))
    return {"id": order_id, "order_number": order_number, "status": payload.status}


@app.get("/api/v1/orders")
async def v1_list_orders(
    request: Request,
    user: dict = Depends(require_permissions("view_all_orders")),
    status: str | None = None,
    rep_id: str | None = None,
    patient_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    db = request.app.state.db_pool
    where = ["o.org_id = $1"]
    params: list[Any] = [user["org_id"]]
    if status:
        params.append(status)
        where.append(f"o.status = ${len(params)}")
    if rep_id:
        params.append(rep_id)
        where.append(f"COALESCE(o.assigned_rep_id, o.assigned_to) = ${len(params)}")
    if patient_id:
        params.append(patient_id)
        where.append(f"o.patient_id = ${len(params)}")
    query = f"""
        SELECT o.id, o.order_number, o.status, o.priority, o.product_category, o.vertical, o.total_billed,
               o.total_allowed, o.total_paid, o.created_at, o.updated_at, o.patient_id,
               COALESCE(o.assigned_rep_id, o.assigned_to) AS assigned_rep_id,
               p.first_name, p.last_name, p.mrn
        FROM orders o
        JOIN patients p ON p.id = o.patient_id
        WHERE {' AND '.join(where)}
        ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC
        LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
    """
    params.extend([limit, offset])
    async with db.connection() as conn:
        rows = await fetch_all(conn, query, *params)
    return {"orders": [_serialize(dict(row)) for row in rows]}


@app.get("/api/v1/orders/{order_id}")
async def v1_get_order(order_id: str, request: Request, user: dict = Depends(require_permissions("view_all_orders"))):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        bundle = await _fetch_order_bundle(conn, user["org_id"], order_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="Order not found")
    return bundle


@app.post("/api/v1/orders/{order_id}/line-items", status_code=201)
async def v1_add_order_line_item(
    order_id: str,
    payload: V1LineItemPayload,
    request: Request,
    user: dict = Depends(require_any_permission("create_orders", "update_patients")),
):
    """Add a device / HCPCS line to an order; updates orders.hcpcs_codes when new code is introduced."""
    db = request.app.state.db_pool
    async with db.connection() as conn:
        order = await fetch_one(
            conn,
            "SELECT id, patient_id, hcpcs_codes FROM orders WHERE id = $1 AND org_id = $2",
            order_id,
            user["org_id"],
        )
        if not order:
            logger.warning(
                "device_add_failed reason=order_not_found order_id=%s org=%s user=%s",
                order_id,
                user.get("org_id"),
                user.get("sub"),
            )
            raise HTTPException(status_code=404, detail="Order not found")
        li_id = str(uuid.uuid4())
        try:
            await exec_write(
                conn,
                """
                INSERT INTO order_line_items (
                    id, order_id, hcpcs_code, modifier, description, quantity,
                    unit_price, billed_amount, allowed_amount, paid_amount
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                """,
                li_id,
                order_id,
                payload.hcpcs_code,
                payload.modifier,
                payload.description,
                payload.quantity,
                payload.unit_price,
                payload.billed_amount,
                payload.allowed_amount,
                payload.paid_amount,
            )
        except Exception as exc:
            logger.warning(
                "device_add_failed order_id=%s org=%s user=%s err=%s",
                order_id,
                user.get("org_id"),
                user.get("sub"),
                exc,
            )
            raise
        raw_hcpcs = order.get("hcpcs_codes")
        hcpcs_list: list[str] = []
        if raw_hcpcs is None:
            hcpcs_list = []
        elif isinstance(raw_hcpcs, str):
            try:
                parsed = json.loads(raw_hcpcs)
                hcpcs_list = list(parsed) if isinstance(parsed, list) else []
            except json.JSONDecodeError:
                hcpcs_list = []
        elif isinstance(raw_hcpcs, list):
            hcpcs_list = [str(x) for x in raw_hcpcs]
        code = _normalize_text(payload.hcpcs_code).upper()
        if code and code not in {c.upper() for c in hcpcs_list}:
            hcpcs_list.append(code)
            await exec_write(
                conn,
                "UPDATE orders SET hcpcs_codes = $1::jsonb, updated_at = NOW() WHERE id = $2 AND org_id = $3",
                json.dumps(hcpcs_list),
                order_id,
                user["org_id"],
            )
        await _record_workflow_event(
            conn,
            user["org_id"],
            "device.added",
            {"order_id": order_id, "patient_id": str(order["patient_id"]), "hcpcs_code": code, "line_item_id": li_id},
            order_id=order_id,
        )
    logger.info("device_added order_id=%s patient_id=%s hcpcs=%s line_item_id=%s", order_id, order["patient_id"], code, li_id)
    return {"id": li_id, "order_id": order_id, "patient_id": str(order["patient_id"])}


@app.patch("/api/v1/orders/{order_id}")
async def v1_patch_order(
    order_id: str,
    payload: V1OrderPatchPayload,
    request: Request,
    user: dict = Depends(require_permissions("update_order_status")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        order = await fetch_one(conn, "SELECT id, status FROM orders WHERE id = $1 AND org_id = $2", order_id, user["org_id"])
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if payload.status and not _canonical_transition_is_valid(str(order["status"]), payload.status):
            raise HTTPException(status_code=409, detail=f"Invalid status transition from {order['status']} to {payload.status}")
        await exec_write(
            conn,
            """
            UPDATE orders
            SET status = COALESCE($1, status),
                assigned_rep_id = COALESCE($2, assigned_rep_id),
                assigned_to = COALESCE($2, assigned_to),
                priority = COALESCE($3, priority),
                clinical_notes = COALESCE($4, clinical_notes),
                notes = COALESCE($4, notes),
                total_billed = COALESCE($5, total_billed),
                total_allowed = COALESCE($6, total_allowed),
                total_paid = COALESCE($7, total_paid),
                paid_amount = COALESCE($7, paid_amount),
                claim_strategy = COALESCE($10, claim_strategy),
                updated_at = NOW()
            WHERE id = $8 AND org_id = $9
            """,
            payload.status,
            payload.assigned_rep_id,
            payload.priority,
            payload.clinical_notes,
            payload.total_billed,
            payload.total_allowed,
            payload.total_paid,
            order_id,
            user["org_id"],
            payload.claim_strategy,
        )
        if payload.status:
            await _record_workflow_event(conn, user["org_id"], "order.status_changed", {"order_id": order_id, "from": order["status"], "to": payload.status}, order_id=order_id)
    return {"id": order_id, "status": payload.status or order["status"]}


@app.get("/api/v1/orders/{order_id}/documents")
async def v1_list_order_documents(
    order_id: str, request: Request, user: dict = Depends(require_any_permission("view_patients", "manage_documents"))
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        order = await fetch_one(
            conn, "SELECT id, patient_id FROM orders WHERE id = $1 AND org_id = $2", order_id, user["org_id"]
        )
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        rows = await fetch_all(conn, "SELECT * FROM order_documents WHERE order_id = $1 ORDER BY created_at DESC", order_id)
    logger.info(
        "document_listed order_id=%s patient_id=%s org=%s user=%s count=%s",
        order_id,
        order.get("patient_id"),
        user["org_id"],
        user.get("sub"),
        len(rows),
    )
    docs = []
    for row in rows:
        item = dict(row)
        if item.get("storage_bucket") and item.get("storage_key"):
            item["download_url"] = _presigned_download_url(item["storage_bucket"], item["storage_key"])
        docs.append(_serialize(item))
    return {"documents": docs}


@app.post("/api/v1/orders/{order_id}/documents", status_code=201)
async def v1_upload_order_document(
    order_id: str,
    request: Request,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(require_any_permission("manage_documents", "update_patients", "create_orders")),
):
    db = request.app.state.db_pool
    content = await file.read()
    normalized_type = _coerce_order_document_doc_type(doc_type)
    upload_meta: dict[str, Any] = {"uploaded_by": user["sub"]}
    async with db.connection() as conn:
        order = await fetch_one(conn, "SELECT id FROM orders WHERE id = $1 AND org_id = $2", order_id, user["org_id"])
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        doc = await _store_document(
            conn,
            user["org_id"],
            order_id,
            normalized_type,
            file.filename or f"{normalized_type}.bin",
            content,
            file.content_type or "application/octet-stream",
            upload_meta,
            "received",
        )
    doc["download_url"] = _presigned_download_url(doc["storage_bucket"], doc["storage_key"])
    return _serialize(doc)


@app.get("/api/v1/orders/{order_id}/documents/{document_id}/download")
async def v1_download_order_document(
    order_id: str,
    document_id: str,
    request: Request,
    user: dict = Depends(require_any_permission("view_patients", "manage_documents")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        row = await fetch_one(
            conn,
            """
            SELECT d.*, o.patient_id AS order_patient_id
            FROM order_documents d
            JOIN orders o ON o.id = d.order_id
            WHERE d.id = $1 AND d.order_id = $2 AND o.org_id = $3
            """,
            document_id,
            order_id,
            user["org_id"],
        )
    if not row:
        logger.warning(
            "document_download_failed reason=not_found order_id=%s document_id=%s org=%s user=%s",
            order_id,
            document_id,
            user.get("org_id"),
            user.get("sub"),
        )
        raise HTTPException(status_code=404, detail="Document not found")
    url = _presigned_download_url(row["storage_bucket"], row["storage_key"])
    logger.info(
        "document_downloaded order_id=%s patient_id=%s document_id=%s org=%s user=%s",
        order_id,
        row.get("order_patient_id"),
        document_id,
        user["org_id"],
        user.get("sub"),
    )
    return {"download_url": url}


@app.patch("/api/v1/orders/{order_id}/documents/{document_id}")
async def v1_patch_order_document(
    order_id: str,
    document_id: str,
    payload: V1DocumentPatchPayload,
    request: Request,
    user: dict = Depends(require_permissions("manage_documents")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        updated = await exec_write(
            conn,
            """
            UPDATE order_documents AS d
            SET status = $1, updated_at = NOW()
            FROM orders o
            WHERE d.id = $2 AND d.order_id = $3 AND o.id = d.order_id AND o.org_id = $4
            """,
            payload.status,
            document_id,
            order_id,
            user["org_id"],
        )
    if not updated:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"id": document_id, "status": payload.status}


@app.post("/api/v1/orders/{order_id}/generate/{doc_type}")
async def v1_generate_order_document(
    order_id: str,
    doc_type: str,
    request: Request,
    user: dict = Depends(require_permissions("manage_documents")),
):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        bundle = await _fetch_order_bundle(conn, user["org_id"], order_id)
        if not bundle:
            raise HTTPException(status_code=404, detail="Order not found")
        pdf_bytes = _render_order_pdf(bundle, doc_type)
        file_name = f"{bundle.get('order_number') or order_id}-{doc_type}.pdf"
        doc = await _store_document(
            conn,
            user["org_id"],
            order_id,
            doc_type,
            file_name,
            pdf_bytes,
            "application/pdf",
            {"generated_by": user["sub"], "generator": "reportlab"},
            "generated",
        )
        await _link_order_primary_document(conn, str(user["org_id"]), order_id, doc_type, str(doc["id"]))
    doc["download_url"] = _presigned_download_url(doc["storage_bucket"], doc["storage_key"])
    return _serialize(doc)


@app.post("/api/v1/admin/materialize-order-packages")
async def v1_materialize_order_packages(
    request: Request,
    user: dict = Depends(require_roles(UserRole.ADMIN)),
    limit: int = 500,
    skip_existing_trident: bool = True,
    unlock_lvco_intake_gates: bool = False,
):
    """
    For each order (up to limit): call Trident score API, store JSON super-package on the order,
    and generate SWO / CMS-1500-style / order summary / POD PDFs when primary document slots are empty.
    """
    db = request.app.state.db_pool
    trident_base = (settings.trident_url or "").rstrip("/")
    if not trident_base:
        raise HTTPException(status_code=503, detail="TRIDENT_API_URL is not configured")
    results: list[dict[str, Any]] = []
    async with db.connection() as conn:
        if unlock_lvco_intake_gates:
            await exec_write(
                conn,
                """
                UPDATE orders
                SET eligibility_status = 'eligible',
                    swo_status = 'ingested',
                    updated_at = NOW()
                WHERE org_id = $1::uuid
                  AND status = 'draft'
                  AND lower(btrim(coalesce(source_channel, ''))) IN ('lvco', 'import')
                """,
                user["org_id"],
            )
        rows = await fetch_all(
            conn,
            """
            SELECT id FROM orders
            WHERE org_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            user["org_id"],
            limit,
        )
        async with httpx.AsyncClient(timeout=60.0) as client:
            for row in rows:
                oid = str(row["id"])
                entry: dict[str, Any] = {"order_id": oid, "steps": []}
                try:
                    bundle = await _fetch_order_bundle(conn, str(user["org_id"]), oid)
                    if not bundle:
                        entry["error"] = "no_bundle"
                        results.append(entry)
                        continue
                    pat = bundle.get("patient") or {}
                    dx_list = [str(d.get("icd10_code")) for d in (bundle.get("diagnoses") or []) if d.get("icd10_code")]
                    if not dx_list:
                        dx_list = [str(x) for x in _coerce_json_list(bundle.get("diagnosis_codes"))]
                    if not dx_list:
                        dx_list = ["Z00.00"]
                    hcpcs_list = [str(x) for x in _coerce_json_list(bundle.get("hcpcs_codes"))]
                    if not hcpcs_list:
                        hcpcs_list, inferred_from = _infer_hcpcs_from_diagnosis(dx_list)
                        logger.warning(
                            "Order %s bundle missing HCPCS; inferred %s from %s",
                            oid,
                            ",".join(hcpcs_list),
                            inferred_from,
                        )
                    score_body = {
                        "icd10_codes": dx_list,
                        "hcpcs_codes": hcpcs_list,
                        "payer_id": str(bundle.get("payer_id") or "UNKNOWN"),
                        "physician_npi": (bundle.get("physician") or {}).get("npi"),
                        "patient_age": _patient_age_years(pat.get("date_of_birth")),
                        "dos": str(bundle.get("date_of_service") or "")[:10] or None,
                    }
                    if skip_existing_trident:
                        has_tp = await fetch_one(
                            conn,
                            "SELECT id FROM order_documents WHERE order_id = $1 AND doc_type = 'trident_super_package' LIMIT 1",
                            oid,
                        )
                    else:
                        has_tp = None
                    if not has_tp:
                        tr = await client.post(f"{trident_base}/api/v1/trident/score", json=score_body)
                        pkg_body: Any
                        try:
                            pkg_body = tr.json()
                        except Exception:
                            pkg_body = {"raw": tr.text, "status_code": tr.status_code}
                        if not tr.is_success:
                            pkg_body = {"error": "trident_request_failed", "detail": pkg_body, "http_status": tr.status_code}
                        raw = json.dumps(pkg_body, indent=2, default=str).encode("utf-8")
                        tdoc = await _store_document(
                            conn,
                            str(user["org_id"]),
                            oid,
                            "trident_super_package",
                            f"{oid}-trident-super-package.json",
                            raw,
                            "application/json",
                            {"trident_http_status": tr.status_code, "materialize": True},
                            "generated",
                        )
                        entry["steps"].append({"trident_super_package": tdoc["id"]})
                    for dtype in ("swo", "cms1500", "order", "pod"):
                        col = PRIMARY_ORDER_DOC_COLUMNS.get(dtype)
                        if col and _normalize_text(bundle.get(col)):
                            continue
                        if dtype == "order":
                            has_order_pdf = await fetch_one(
                                conn,
                                "SELECT id FROM order_documents WHERE order_id = $1 AND doc_type = 'order' LIMIT 1",
                                oid,
                            )
                            if has_order_pdf:
                                continue
                        pdf_bytes = _render_order_pdf(bundle, dtype)
                        fn = f"{bundle.get('order_number') or oid}-{dtype}.pdf"
                        doc = await _store_document(
                            conn,
                            str(user["org_id"]),
                            oid,
                            dtype,
                            fn,
                            pdf_bytes,
                            "application/pdf",
                            {"generated_by": user["sub"], "materialize": True},
                            "generated",
                        )
                        await _link_order_primary_document(conn, str(user["org_id"]), oid, dtype, str(doc["id"]))
                        entry["steps"].append({f"pdf_{dtype}": doc["id"]})
                    entry["status"] = "ok"
                except Exception as exc:
                    logger.exception("materialize order %s failed", oid)
                    entry["error"] = str(exc)
                results.append(entry)
    return {"processed": len(results), "results": results}


@app.get("/api/v1/analytics/kpis")
async def v1_analytics_kpis(request: Request, user: dict = Depends(require_permissions("view_analytics"))):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        totals = await fetch_one(
            conn,
            """
            SELECT COUNT(*) AS total_orders,
                   COALESCE(SUM(total_billed), 0) AS revenue_mtd
            FROM orders
            WHERE org_id = $1
              AND date_trunc('month', created_at) = date_trunc('month', now())
            """,
            user["org_id"],
        )
        by_status = await fetch_all(conn, "SELECT status, COUNT(*) AS count FROM orders WHERE org_id = $1 GROUP BY status ORDER BY count DESC", user["org_id"])
        denial = await fetch_one(
            conn,
            "SELECT COUNT(*) FILTER (WHERE is_denial = true)::float / NULLIF(COUNT(*), 0) AS denial_rate FROM payment_outcomes WHERE org_id = $1",
            user["org_id"],
        )
        avg_days = await fetch_one(
            conn,
            "SELECT AVG(EXTRACT(EPOCH FROM (paid_at - created_at)) / 86400.0) AS avg_days_to_payment FROM orders WHERE org_id = $1 AND paid_at IS NOT NULL",
            user["org_id"],
        )
        top_denials = await fetch_all(
            conn,
            """
            SELECT COALESCE(denial_category, notes, 'unknown') AS reason, COUNT(*) AS count
            FROM denials
            WHERE org_id = $1
            GROUP BY 1
            ORDER BY count DESC
            LIMIT 5
            """,
            user["org_id"],
        )
        rep_perf = await fetch_all(
            conn,
            """
            SELECT u.id, u.first_name, u.last_name,
                   COUNT(o.id) FILTER (WHERE o.status IN ('paid','closed')) AS orders_completed,
                   AVG(EXTRACT(EPOCH FROM (COALESCE(o.paid_at, o.updated_at) - o.created_at)) / 86400.0) AS avg_cycle_time
            FROM users u
            LEFT JOIN orders o ON COALESCE(o.assigned_rep_id, o.assigned_to) = u.id AND o.org_id = u.org_id
            WHERE u.org_id = $1 AND u.role = 'rep'
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY orders_completed DESC, avg_cycle_time ASC NULLS LAST
            """,
            user["org_id"],
        )
        payer_perf = await fetch_all(
            conn,
            """
            SELECT payer_id,
                   COUNT(*) AS claim_count,
                   AVG(CASE WHEN is_denial THEN 1.0 ELSE 0.0 END) AS denial_rate
            FROM payment_outcomes
            WHERE org_id = $1
            GROUP BY payer_id
            ORDER BY denial_rate DESC NULLS LAST, claim_count DESC
            """,
            user["org_id"],
        )
        ar_rows = await fetch_all(
            conn,
            """
            SELECT
                CASE
                    WHEN age_bucket <= 30 THEN '0-30'
                    WHEN age_bucket <= 60 THEN '31-60'
                    WHEN age_bucket <= 90 THEN '61-90'
                    ELSE '90+'
                END AS bucket,
                SUM(balance) AS amount
            FROM (
                SELECT GREATEST(0, COALESCE(total_billed, 0) - COALESCE(total_paid, 0)) AS balance,
                       EXTRACT(DAY FROM (now() - created_at))::int AS age_bucket
                FROM orders
                WHERE org_id = $1 AND status NOT IN ('paid', 'closed', 'cancelled')
            ) aged
            GROUP BY bucket
            ORDER BY bucket
            """,
            user["org_id"],
        )
    return {
        "total_orders": int((totals or {}).get("total_orders") or 0),
        "orders_by_status": [_serialize(dict(row)) for row in by_status],
        "denial_rate": float((denial or {}).get("denial_rate") or 0),
        "avg_days_to_payment": float((avg_days or {}).get("avg_days_to_payment") or 0),
        "ar_aging_buckets": [_serialize(dict(row)) for row in ar_rows],
        "revenue_mtd": float((totals or {}).get("revenue_mtd") or 0),
        "top_denial_reasons": [_serialize(dict(row)) for row in top_denials],
        "rep_performance": [_serialize(dict(row)) for row in rep_perf],
        "payer_performance": [_serialize(dict(row)) for row in payer_perf],
    }


@app.get("/api/v1/analytics/denials")
async def v1_analytics_denials(request: Request, user: dict = Depends(require_permissions("view_analytics"))):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        by_category = await fetch_all(conn, "SELECT denial_category, COUNT(*) AS count FROM denials WHERE org_id = $1 GROUP BY denial_category ORDER BY count DESC", user["org_id"])
        by_payer = await fetch_all(
            conn,
            """
            SELECT COALESCE(payer_id, 'unknown') AS payer_id,
                   COALESCE(payer_name, 'unknown') AS payer_name,
                   COUNT(*) AS count
            FROM payment_outcomes
            WHERE org_id = $1 AND is_denial = true
            GROUP BY 1, 2
            ORDER BY count DESC
            """,
            user["org_id"],
        )
        by_hcpcs = await fetch_all(
            conn,
            """
            SELECT po.hcpcs_code, COUNT(*) AS count
            FROM payment_outcomes po
            WHERE po.org_id = $1 AND po.is_denial = true
            GROUP BY po.hcpcs_code
            ORDER BY count DESC
            LIMIT 10
            """,
            user["org_id"],
        )
        trend = await fetch_all(
            conn,
            """
            SELECT date_trunc('week', created_at)::date AS week, COUNT(*) AS count
            FROM denials
            WHERE org_id = $1
            GROUP BY 1
            ORDER BY 1
            """,
            user["org_id"],
        )
    return {
        "by_category": [_serialize(dict(row)) for row in by_category],
        "by_payer": [_serialize(dict(row)) for row in by_payer],
        "by_hcpcs": [_serialize(dict(row)) for row in by_hcpcs],
        "trending": [_serialize(dict(row)) for row in trend],
    }


@app.get("/api/v1/analytics/ar-aging")
async def v1_analytics_ar_aging(request: Request, user: dict = Depends(require_permissions("view_analytics"))):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        rows = await fetch_all(
            conn,
            """
            SELECT
                CASE
                    WHEN age_days <= 30 THEN '0-30'
                    WHEN age_days <= 60 THEN '31-60'
                    WHEN age_days <= 90 THEN '61-90'
                    ELSE '90+'
                END AS bucket,
                SUM(balance_due) AS amount
            FROM (
                SELECT EXTRACT(DAY FROM (now() - created_at))::int AS age_days,
                       GREATEST(0, COALESCE(total_billed,0) - COALESCE(total_paid,0)) AS balance_due
                FROM orders
                WHERE org_id = $1 AND status NOT IN ('paid', 'closed', 'cancelled')
            ) source
            GROUP BY 1
            ORDER BY 1
            """,
            user["org_id"],
        )
    return {"buckets": [_serialize(dict(row)) for row in rows]}


@app.get("/api/v1/analytics/rep-performance")
async def v1_rep_performance(request: Request, user: dict = Depends(require_permissions("view_analytics"))):
    db = request.app.state.db_pool
    async with db.connection() as conn:
        rows = await fetch_all(
            conn,
            """
            SELECT u.id, u.first_name, u.last_name,
                   COALESCE(SUM(o.total_billed), 0) AS pipeline_value,
                   COUNT(o.id) FILTER (WHERE o.status = 'intake') AS intake_count,
                   COUNT(o.id) FILTER (WHERE o.status = 'pending_auth') AS pending_auth_count,
                   COUNT(o.id) FILTER (WHERE o.status = 'submitted') AS submitted_count,
                   COUNT(o.id) FILTER (WHERE o.status = 'denied') AS denied_count,
                   AVG(EXTRACT(EPOCH FROM (COALESCE(o.paid_at, o.updated_at) - o.created_at)) / 86400.0) AS avg_cycle_time,
                   AVG(CASE WHEN po.is_denial THEN 1.0 ELSE 0.0 END) AS denial_rate
            FROM users u
            LEFT JOIN orders o ON COALESCE(o.assigned_rep_id, o.assigned_to) = u.id AND o.org_id = u.org_id
            LEFT JOIN payment_outcomes po ON po.order_id = o.id
            WHERE u.org_id = $1 AND u.role = 'rep'
            GROUP BY u.id, u.first_name, u.last_name
            ORDER BY pipeline_value DESC, avg_cycle_time ASC NULLS LAST
            """,
            user["org_id"],
        )
    return {"reps": [_serialize(dict(row)) for row in rows]}


@app.post("/api/v1/webhooks/dropbox-sign")
async def v1_dropbox_sign_webhook(payload: dict[str, Any], request: Request):
    order_id = payload.get("order_id")
    if not order_id:
        raise HTTPException(status_code=400, detail="Missing order_id")
    signed_at = payload.get("signed_at") or datetime.now(timezone.utc).isoformat()
    db = request.app.state.db_pool
    async with db.connection() as conn:
        order = await fetch_one(conn, "SELECT id, org_id FROM orders WHERE id = $1", order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        await exec_write(
            conn,
            """
            UPDATE orders
            SET status = 'documents_pending',
                swo_status = 'signed',
                updated_at = NOW()
            WHERE id = $1
            """,
            order_id,
        )
        await _record_workflow_event(conn, str(order["org_id"]), "dropbox_sign.completed", {"order_id": order_id, "signed_at": signed_at}, order_id=order_id)
    return {"status": "processed", "order_id": order_id}


@app.post("/api/v1/webhooks/tracking")
async def v1_tracking_webhook(payload: dict[str, Any], request: Request):
    order_id = payload.get("order_id")
    tracking_number = payload.get("tracking_number")
    tracking_status = payload.get("tracking_status") or "in_transit"
    carrier = (payload.get("carrier") or "other").lower()
    if not order_id or not tracking_number:
        raise HTTPException(status_code=400, detail="Missing order_id or tracking_number")
    if carrier not in {"fedex", "ups", "usps", "courier", "other"}:
        carrier = "other"
    db = request.app.state.db_pool
    async with db.connection() as conn:
        order = await fetch_one(conn, "SELECT id, org_id FROM orders WHERE id = $1", order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        await exec_write(
            conn,
            """
            INSERT INTO shipments (
                id, order_id, org_id, carrier, tracking_number, status, actual_delivery, events
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (carrier, tracking_number)
            DO UPDATE SET status = EXCLUDED.status, actual_delivery = EXCLUDED.actual_delivery, events = EXCLUDED.events, updated_at = NOW()
            """,
            str(uuid.uuid4()),
            order_id,
            str(order["org_id"]),
            carrier,
            tracking_number,
            tracking_status,
            datetime.now(timezone.utc).date().isoformat() if "deliver" in tracking_status.lower() else None,
            json.dumps(payload.get("events") or []),
        )
        await exec_write(
            conn,
            """
            UPDATE orders
            SET tracking_number = $1,
                tracking_carrier = $2,
                tracking_status = $3,
                delivered_at = CASE WHEN $4 = 'yes' THEN NOW() ELSE delivered_at END,
                updated_at = NOW()
            WHERE id = $5
            """,
            tracking_number,
            carrier,
            tracking_status,
            "yes" if "deliver" in tracking_status.lower() else "no",
            order_id,
        )
        await _record_workflow_event(conn, str(order["org_id"]), "shipment.updated", {"order_id": order_id, "tracking_number": tracking_number, "tracking_status": tracking_status}, order_id=order_id)
    return {"status": "processed", "order_id": order_id, "tracking_number": tracking_number}


def _skip_core_schema_gate(path: str) -> bool:
    """Auth must work before operators can run migrations or fix config from the UI."""
    if path in ("/health", "/live", "/ready"):
        return True
    if path.startswith("/auth/") or path.startswith("/api/v1/auth/"):
        return True
    return False


@app.middleware("http")
async def enforce_core_schema_version(request: Request, call_next):
    global _core_schema_verified, _core_schema_gate_lock
    if _skip_core_schema_gate(request.url.path):
        return await call_next(request)
    if _core_schema_gate_lock is None:
        _core_schema_gate_lock = asyncio.Lock()
    async with _core_schema_gate_lock:
        if not _core_schema_verified:
            pool = request.app.state.db_pool
            async with pool.connection() as conn:
                await _assert_core_schema_version_and_columns(conn)
            _core_schema_verified = True
    return await call_next(request)
