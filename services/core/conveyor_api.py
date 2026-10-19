"""Zoho -> SPEAR -> Zoho Sheet/Mail automation for Mommy Care Kit."""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone
import hmac
import hashlib
import json
import os
import re
import sys
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from psycopg.rows import dict_row

from base import logger, settings
from business_mail import BusinessMailError, ZohoConfig
from mommy_care_workflow import (
    build_paid_notification,
    build_welcome_email,
    normalize_recipients,
    stable_record_id,
)
from zoho_mail_outbound import ZohoMailSendUncertain, ZohoMailSender
from zoho_sheet import ZohoSheet, ZohoSheetConfig, ZohoSheetError, ZohoSheetWriteUncertain


router = APIRouter(tags=["Mommy Care Kit Automation"])
_DATE_FORMATS = ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_RECORD_ID_RE = re.compile(r"^MCK-[A-Z0-9_-]{4,64}$")


class IdentityConflict(RuntimeError):
    """Raised when an intake cannot be safely reconciled to one patient."""


def _clean(value: str | None) -> str | None:
    normalized = " ".join((value or "").split())
    return normalized or None


def _date(value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError("Date must use YYYY-MM-DD or MM/DD/YYYY")


def _phone_key(value: Any) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[-10:] if len(digits) >= 10 else digits


def _email_key(value: Any) -> str:
    return str(value or "").strip().lower()


def _bind(query: str, params: tuple[Any, ...]) -> tuple[str, tuple[Any, ...]]:
    """Translate numbered PostgreSQL placeholders while preserving repeats/order."""
    ordered: list[Any] = []

    def replace(match: re.Match[str]) -> str:
        index = int(match.group(1)) - 1
        if index < 0 or index >= len(params):
            raise ValueError(f"SQL placeholder ${index + 1} has no parameter")
        ordered.append(params[index])
        return "%s"

    return re.sub(r"\$(\d+)", replace, query.replace("%", "%%")), tuple(ordered)


async def _one(conn, query: str, *params: Any) -> dict[str, Any] | None:
    statement, ordered = _bind(query, params)
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(statement, ordered)
        row = await cur.fetchone()
    return dict(row) if row else None


async def _all(conn, query: str, *params: Any) -> list[dict[str, Any]]:
    statement, ordered = _bind(query, params)
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(statement, ordered)
        return [dict(row) for row in await cur.fetchall()]


async def _write(conn, query: str, *params: Any) -> int:
    statement, ordered = _bind(query, params)
    async with conn.cursor() as cur:
        await cur.execute(statement, ordered)
        return cur.rowcount


class MckIntakePayload(BaseModel):
    source_reference: str = Field(min_length=3, max_length=255)
    record_id: str | None = None
    submitted_at: str | None = None
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    date_of_birth: str | None = None
    due_date: str | None = None
    gender: str | None = None
    phone: str | None = None
    email: str | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    insurance_plan: str | None = None
    payer_id: str | None = None
    member_id: str | None = None
    group_number: str | None = None
    medicaid: bool | None = None
    provider_name: str | None = None
    provider_npi: str | None = None
    provider_practice: str | None = None
    provider_phone: str | None = None
    provider_fax: str | None = None
    items_requested: list[str] = Field(default_factory=list, max_length=20)
    notes: str | None = None

    @field_validator("date_of_birth", "due_date")
    @classmethod
    def normalize_dates(cls, value: str | None) -> str | None:
        return _date(value)

    @field_validator(
        "source_reference", "record_id", "first_name", "last_name", "gender",
        "phone", "email", "address_line1", "address_line2", "city", "state",
        "zip_code", "insurance_plan", "payer_id", "member_id", "group_number",
        "provider_name", "provider_npi", "provider_practice", "provider_phone",
        "provider_fax", "notes", mode="before",
    )
    @classmethod
    def trim(cls, value: Any) -> Any:
        return _clean(value) if isinstance(value, str) else value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        if not value:
            return None
        normalized = value.lower()
        if not _EMAIL_RE.fullmatch(normalized):
            raise ValueError("email is invalid")
        return normalized

    @field_validator("state")
    @classmethod
    def normalize_state(cls, value: str | None) -> str | None:
        return value.upper() if value else value

    @field_validator("provider_npi")
    @classmethod
    def validate_npi(cls, value: str | None) -> str | None:
        if not value:
            return None
        digits = re.sub(r"\D", "", value)
        if len(digits) != 10:
            raise ValueError("provider_npi must be 10 digits")
        return digits

    @field_validator("record_id")
    @classmethod
    def validate_record_id(cls, value: str | None) -> str | None:
        if value and not _RECORD_ID_RE.fullmatch(value.upper()):
            raise ValueError("record_id must use the MCK- identifier format")
        return value.upper() if value else None

    @field_validator("items_requested", mode="before")
    @classmethod
    def normalize_items(cls, value: Any) -> list[str]:
        values = re.split(r"[,;\n]+", value) if isinstance(value, str) else (value or [])
        if not isinstance(values, list):
            raise ValueError("items_requested must be a list or comma-separated string")
        result: list[str] = []
        seen: set[str] = set()
        for item in values:
            normalized = _clean(str(item))
            if normalized and normalized.lower() not in seen:
                result.append(normalized)
                seen.add(normalized.lower())
        return result


class PaidDispatchRequest(BaseModel):
    limit: int = Field(default=25, ge=1, le=100)


async def _event(
    conn,
    org_id: str,
    event_type: str,
    payload: dict[str, Any],
    order_id: str | None = None,
) -> None:
    await _write(
        conn,
        "INSERT INTO workflow_events (org_id,order_id,event_type,payload) "
        "VALUES ($1::uuid,$2::uuid,$3,$4::jsonb)",
        org_id,
        order_id,
        event_type,
        json.dumps(payload, default=str, separators=(",", ":")),
    )


async def _source_event_exists(conn, org_id: str, event_type: str, source: str) -> bool:
    return bool(
        await _one(
            conn,
            "SELECT 1 present FROM workflow_events WHERE org_id=$1::uuid "
            "AND event_type=$2 AND payload->>'source_reference'=$3 LIMIT 1",
            org_id,
            event_type,
            source,
        )
    )


async def _order_event(conn, order_id: str, event_types: tuple[str, ...]) -> bool:
    return bool(
        await _one(
            conn,
            "SELECT 1 present FROM workflow_events WHERE order_id=$1::uuid "
            "AND event_type=ANY($2) LIMIT 1",
            order_id,
            list(event_types),
        )
    )


def _internal(request: Request) -> None:
    configured = settings.internal_api_key or ""
    provided = request.headers.get("X-Internal-API-Key", "").strip()
    if not configured:
        raise HTTPException(503, "INTERNAL_API_KEY is not configured")
    if not provided or not hmac.compare_digest(provided, configured):
        raise HTTPException(401, "Invalid internal service key")


def _org_id() -> str:
    value = os.getenv("MCK_ORG_ID", "").strip()
    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError) as exc:
        raise HTTPException(503, "MCK_ORG_ID is not configured with a valid UUID") from exc


def _provider(payload: MckIntakePayload) -> str:
    return " • ".join(
        filter(None, (payload.provider_name, payload.provider_practice, payload.provider_phone))
    ) or "Provider not provided"


def _address_payload(payload: MckIntakePayload) -> dict[str, str]:
    return {
        key: value
        for key, value in {
            "line1": payload.address_line1,
            "line2": payload.address_line2,
            "city": payload.city,
            "state": payload.state,
            "zip": payload.zip_code,
        }.items()
        if value
    }


def _outstanding(payload: MckIntakePayload) -> str:
    items: list[str] = []
    if not payload.date_of_birth:
        items.append("DOB")
    if not payload.member_id:
        items.append("Insurance")
    items.append("ID")
    if not all((payload.address_line1, payload.city, payload.state, payload.zip_code)):
        items.append("Address")
    if not payload.provider_name:
        items.append("Provider")
    items.extend(["SWO", "Doctor Notes"])
    return "Needs " + " / ".join(items)


def _candidate_matches_identifier(candidate: dict[str, Any], payload: MckIntakePayload) -> bool:
    input_phone = _phone_key(payload.phone)
    stored_phone = _phone_key(candidate.get("phone"))
    input_email = _email_key(payload.email)
    stored_email = _email_key(candidate.get("email"))
    return bool(
        (input_phone and stored_phone and input_phone == stored_phone)
        or (input_email and stored_email and input_email == stored_email)
    )


def _candidate_has_conflict(candidate: dict[str, Any], payload: MckIntakePayload) -> bool:
    input_phone = _phone_key(payload.phone)
    stored_phone = _phone_key(candidate.get("phone"))
    input_email = _email_key(payload.email)
    stored_email = _email_key(candidate.get("email"))
    return bool(
        (input_phone and stored_phone and input_phone != stored_phone)
        or (input_email and stored_email and input_email != stored_email)
    )


async def _resolve_patient(conn, payload: MckIntakePayload, org_id: str) -> dict[str, Any] | None:
    candidates = await _all(
        conn,
        "SELECT id,phone,email,address_line1,address_line2,city,state,zip_code,address "
        "FROM patients WHERE org_id=$1::uuid "
        "AND lower(first_name)=lower($2) AND lower(last_name)=lower($3) "
        "AND COALESCE(date_of_birth,dob)=$4::date "
        "ORDER BY updated_at DESC,created_at DESC",
        org_id,
        payload.first_name,
        payload.last_name,
        payload.date_of_birth,
    )
    if not candidates:
        return None
    exact = [candidate for candidate in candidates if _candidate_matches_identifier(candidate, payload)]
    if len(exact) == 1:
        if _candidate_has_conflict(exact[0], payload):
            raise IdentityConflict(
                "The submitted phone or email conflicts with the existing SPEAR patient"
            )
        return exact[0]
    if len(exact) > 1:
        raise IdentityConflict("More than one SPEAR patient matches the submitted identity")
    if len(candidates) > 1:
        raise IdentityConflict(
            "Multiple SPEAR patients share the submitted name and DOB; phone or email must match"
        )
    candidate = candidates[0]
    if _candidate_has_conflict(candidate, payload):
        raise IdentityConflict(
            "The submitted phone or email conflicts with the existing SPEAR patient"
        )
    return candidate


async def _upsert_patient(conn, payload: MckIntakePayload, org_id: str) -> tuple[str, bool]:
    existing = await _resolve_patient(conn, payload, org_id)
    address_json = json.dumps(_address_payload(payload), separators=(",", ":"))
    if existing:
        patient_id = str(existing["id"])
        await _write(
            conn,
            "UPDATE patients SET "
            "phone=CASE WHEN COALESCE(phone,'')='' THEN $1 ELSE phone END, "
            "email=CASE WHEN COALESCE(email,'')='' THEN $2 ELSE email END, "
            "address_line1=CASE WHEN COALESCE(address_line1,'')='' THEN $3 ELSE address_line1 END, "
            "address_line2=CASE WHEN COALESCE(address_line2,'')='' THEN $4 ELSE address_line2 END, "
            "city=CASE WHEN COALESCE(city,'')='' THEN $5 ELSE city END, "
            "state=CASE WHEN COALESCE(state,'')='' THEN $6 ELSE state END, "
            "zip_code=CASE WHEN COALESCE(zip_code,'')='' THEN $7 ELSE zip_code END, "
            "address=COALESCE(address,'{}'::jsonb) || $8::jsonb,updated_at=NOW() "
            "WHERE id=$9::uuid AND org_id=$10::uuid",
            payload.phone,
            payload.email,
            payload.address_line1,
            payload.address_line2,
            payload.city,
            payload.state,
            payload.zip_code,
            address_json,
            patient_id,
            org_id,
        )
        return patient_id, False

    patient_id = str(uuid.uuid4())
    await _write(
        conn,
        "INSERT INTO patients "
        "(id,org_id,first_name,last_name,date_of_birth,dob,gender,phone,email,"
        "address_line1,address_line2,city,state,zip_code,address) "
        "VALUES ($1::uuid,$2::uuid,$3,$4,$5::date,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)",
        patient_id,
        org_id,
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
        address_json,
    )
    return patient_id, True


async def _upsert_insurance(conn, payload: MckIntakePayload, patient_id: str) -> str | None:
    if not payload.insurance_plan:
        return None
    if payload.member_id:
        insurance = await _one(
            conn,
            "SELECT id FROM patient_insurances WHERE patient_id=$1::uuid "
            "AND lower(payer_name)=lower($2) AND COALESCE(member_id,'')=$3 "
            "ORDER BY is_primary DESC,created_at DESC LIMIT 1",
            patient_id,
            payload.insurance_plan,
            payload.member_id,
        )
    else:
        insurance = await _one(
            conn,
            "SELECT id FROM patient_insurances WHERE patient_id=$1::uuid "
            "AND lower(payer_name)=lower($2) AND is_active=true "
            "ORDER BY is_primary DESC,created_at DESC LIMIT 1",
            patient_id,
            payload.insurance_plan,
        )
    if insurance:
        insurance_id = str(insurance["id"])
        await _write(
            conn,
            "UPDATE patient_insurances SET "
            "payer_id=COALESCE(NULLIF(payer_id,''),$1),"
            "member_id=COALESCE(NULLIF(member_id,''),$2),"
            "group_number=COALESCE(NULLIF(group_number,''),$3) "
            "WHERE id=$4::uuid",
            payload.payer_id,
            payload.member_id,
            payload.group_number,
            insurance_id,
        )
        return insurance_id

    insurance_id = str(uuid.uuid4())
    await _write(
        conn,
        "INSERT INTO patient_insurances "
        "(id,patient_id,payer_name,payer_id,member_id,group_number,relationship,is_primary) "
        "VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,'self',true)",
        insurance_id,
        patient_id,
        payload.insurance_plan,
        payload.payer_id,
        payload.member_id,
        payload.group_number,
    )
    return insurance_id


async def _upsert_physician(conn, payload: MckIntakePayload) -> str | None:
    if not payload.provider_npi:
        return None
    physician = await _one(
        conn,
        "SELECT id FROM physicians WHERE npi=$1 ORDER BY created_at ASC LIMIT 1",
        payload.provider_npi,
    )
    if physician:
        physician_id = str(physician["id"])
        await _write(
            conn,
            "UPDATE physicians SET "
            "phone=COALESCE(NULLIF(phone,''),$1),fax=COALESCE(NULLIF(fax,''),$2),"
            "facility_name=COALESCE(NULLIF(facility_name,''),$3) WHERE id=$4::uuid",
            payload.provider_phone,
            payload.provider_fax,
            payload.provider_practice,
            physician_id,
        )
        return physician_id

    physician_id = str(uuid.uuid4())
    name_parts = (payload.provider_name or "").split()
    first_name = name_parts[0] if name_parts else None
    last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else None
    await _write(
        conn,
        "INSERT INTO physicians "
        "(id,npi,first_name,last_name,phone,fax,facility_name,address) "
        "VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,'{}'::jsonb)",
        physician_id,
        payload.provider_npi,
        first_name,
        last_name,
        payload.provider_phone,
        payload.provider_fax,
        payload.provider_practice,
    )
    return physician_id


async def _spear_upsert(
    db,
    payload: MckIntakePayload,
    *,
    org_id: str,
    record_id: str,
) -> dict[str, Any]:
    if not payload.date_of_birth:
        raise ValueError("DOB is required to create or reconcile the SPEAR patient")

    async with db.connection() as conn:
        await conn.execute("BEGIN")
        try:
            await _one(
                conn,
                "SELECT pg_advisory_xact_lock(hashtext($1)) locked",
                f"mck-intake:{org_id}:{payload.source_reference}",
            )
            replay = await _one(
                conn,
                "SELECT id,patient_id,physician_id FROM orders "
                "WHERE org_id=$1::uuid AND (source_reference=$2 "
                "OR intake_payload->>'_intake_idempotency_key'=$2) "
                "ORDER BY created_at DESC LIMIT 1",
                org_id,
                payload.source_reference,
            )
            if replay:
                await conn.execute("COMMIT")
                return {
                    "patient_id": str(replay["patient_id"]),
                    "order_id": str(replay["id"]),
                    "physician_id": (
                        str(replay["physician_id"]) if replay.get("physician_id") else None
                    ),
                    "idempotent_replay": True,
                }

            patient_id, patient_created = await _upsert_patient(conn, payload, org_id)
            insurance_id = await _upsert_insurance(conn, payload, patient_id)
            physician_id = await _upsert_physician(conn, payload)

            order_id = str(uuid.uuid4())
            received_at = datetime.now(timezone.utc).isoformat()
            clinical = {
                "mck_record_id": record_id,
                "source_reference": payload.source_reference,
                "due_date": payload.due_date,
                "medicaid_reported": payload.medicaid,
                "items_requested": payload.items_requested,
                "provider_name_as_submitted": payload.provider_name,
                "provider_practice_as_submitted": payload.provider_practice,
                "provider_phone_as_submitted": payload.provider_phone,
                "provider_fax_as_submitted": payload.provider_fax,
            }
            intake_payload = {
                **clinical,
                "_intake_received_at": received_at,
                "_intake_idempotency_key": payload.source_reference,
                "_processing_status": "received",
            }
            await _write(
                conn,
                "INSERT INTO orders "
                "(id,org_id,order_number,patient_id,physician_id,referring_physician_npi,"
                "status,product_category,vertical,source,priority,place_of_service,"
                "clinical_notes,clinical_data,hcpcs_codes,intake_payload,source_channel,"
                "source_reference,payer_id) "
                "VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,$6,'intake',"
                "'Mommy Care Kit','dme','mommycarekit','normal','12',$7,$8::jsonb,"
                "'[]'::jsonb,$9::jsonb,'zoho',$10,$11)",
                order_id,
                org_id,
                f"MCK-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{order_id[:6].upper()}",
                patient_id,
                physician_id,
                payload.provider_npi,
                payload.notes,
                json.dumps(clinical, separators=(",", ":")),
                json.dumps(intake_payload, separators=(",", ":")),
                payload.source_reference,
                payload.payer_id,
            )
            await _event(
                conn,
                org_id,
                "mck.intake.created",
                {
                    "source_reference": payload.source_reference,
                    "record_id": record_id,
                    "patient_id": patient_id,
                    "patient_created": patient_created,
                    "received_at": received_at,
                },
                order_id,
            )
            await conn.execute("COMMIT")
            return {
                "patient_id": patient_id,
                "insurance_id": insurance_id,
                "physician_id": physician_id,
                "order_id": order_id,
                "idempotent_replay": False,
            }
        except Exception:
            await conn.execute("ROLLBACK")
            raise


def _sheet_rows(
    payload: MckIntakePayload,
    record_id: str,
    spear: dict[str, Any] | None,
    outstanding: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    patient_id = str((spear or {}).get("patient_id") or "")
    patient = {
        "Patient Name": f"{payload.first_name} {payload.last_name}".strip(),
        "DOB": payload.date_of_birth or "",
        "Due Date": payload.due_date or "",
        "Patient Phone": payload.phone or "",
        "Patient Email": payload.email or "",
        "Insurance Name": payload.insurance_plan or "",
        "Practice": payload.provider_practice or "",
        "Referring Physician": payload.provider_name or "",
        "Dr. Office Contact": payload.provider_phone or "",
        "SPEAR Intake": bool(spear),
        "Intake Date": date.today().isoformat(),
        "Current Stage": "In SPEAR" if spear else "New Intake",
        "Owner": "Heather",
        "Notes": (
            f"Zoho API intake {payload.source_reference}. Items requested: "
            f"{', '.join(payload.items_requested) or 'not supplied'}"
        ),
        "Doctor Notes Received": "Outstanding",
        "SWO Status (cover)": "Outstanding",
        "Heather Follow-up": outstanding,
        "Doctor / Office (cover)": _provider(payload),
        "SPEAR Review / Outstanding": outstanding,
        "SPEAR Chart": (
            f"https://dashboard.strykefox.com/spear/patients/{patient_id}" if patient_id else ""
        ),
        "SPEAR Checked": date.today().isoformat() if patient_id else "",
        "Record ID": record_id,
    }
    cover = {
        "Patient": patient["Patient Name"],
        "Due Date": payload.due_date or "",
        "Doctor / Office": _provider(payload),
        "Signed SWO Returned": "Outstanding",
        "Doctor Notes Received": "Outstanding",
        "Outstanding / Follow-up": outstanding,
        "Record ID": record_id,
    }
    return patient, cover


async def _sheet_project(
    client: httpx.AsyncClient,
    payload: MckIntakePayload,
    record_id: str,
    spear: dict[str, Any] | None,
    outstanding: str,
    *,
    db,
    org_id: str,
) -> dict[str, str]:
    config = ZohoSheetConfig.from_env()
    sheet = ZohoSheet(client, config)
    patient, cover = _sheet_rows(payload, record_id, spear, outstanding)
    initialize_only = (
        "Intake Date", "Current Stage", "Notes", "Doctor Notes Received",
        "SWO Status (cover)", "Signed SWO Returned", "Heather Follow-up",
        "Outstanding / Follow-up", "SPEAR Review / Outstanding", "Owner",
    )
    results: dict[str, str] = {}
    for leg, worksheet, values in (
        ("patient_details", config.patient_details_sheet, patient),
        ("heather_cover", config.heather_cover_sheet, cover),
    ):
        key = hashlib.sha256(json.dumps(
            [org_id, config.resource_id, worksheet, record_id], separators=(",", ":")
        ).encode()).hexdigest()
        fingerprint = hashlib.sha256(json.dumps(
            values, sort_keys=True, default=str, separators=(",", ":")
        ).encode()).hexdigest()
        lock_name = f"mck-sheet:{key}"
        event_types = [f"mck.sheet.projection.{suffix}" for suffix in
                       ("dispatching", "confirmed", "uncertain", "retryable")]
        async with db.connection() as conn:
            lock = await _one(conn, "SELECT pg_try_advisory_lock(hashtext($1)) locked", lock_name)
            if not lock or not lock.get("locked"):
                raise ZohoSheetError("Tracker projection already in progress.", 409)
            try:
                prior = await _one(
                    conn,
                    "SELECT event_type,payload FROM workflow_events WHERE org_id=$1::uuid "
                    "AND event_type=ANY($2) AND payload->>'projection_key'=$3 "
                    "ORDER BY created_at DESC,id DESC LIMIT 1",
                    org_id, event_types, key,
                )
                prior_data = (prior or {}).get("payload") or {}
                if isinstance(prior_data, str):
                    prior_data = json.loads(prior_data)
                prior_type = str((prior or {}).get("event_type") or "")
                if (prior_type.endswith(".confirmed")
                        and prior_data.get("fingerprint") == fingerprint):
                    results[leg] = "already_projected"
                    continue
                # Carry this fact across retryable lookup failures. A delayed index must
                # never convert a previously confirmed/ambiguous append into a new append.
                may_exist = bool(prior_data.get("may_exist")) or prior_type.endswith(
                    (".dispatching", ".confirmed", ".uncertain")
                )
                event_data = {
                    "projection_key": key, "fingerprint": fingerprint,
                    "record_id": record_id, "source_reference": payload.source_reference,
                    "worksheet": worksheet, "resource_id": config.resource_id,
                    "attempt_id": str(uuid.uuid4()), "may_exist": True,
                }
                order_id = str((spear or {}).get("order_id") or "") or None
                await _event(conn, org_id, "mck.sheet.projection.dispatching", event_data, order_id)
                await conn.commit()
                try:
                    result = await sheet.upsert_record(
                        worksheet_name=worksheet, record_id=record_id, values=values,
                        allow_create=not may_exist, initialize_only=initialize_only,
                    )
                except ZohoSheetWriteUncertain:
                    await conn.rollback()
                    await _event(conn, org_id, "mck.sheet.projection.uncertain", event_data, order_id)
                    await conn.commit()
                    raise
                except ZohoSheetError:
                    await conn.rollback()
                    await _event(conn, org_id, "mck.sheet.projection.retryable",
                                 {**event_data, "may_exist": may_exist}, order_id)
                    await conn.commit()
                    raise
                except Exception as exc:
                    await conn.rollback()
                    await _event(conn, org_id, "mck.sheet.projection.uncertain", event_data, order_id)
                    await conn.commit()
                    raise ZohoSheetWriteUncertain("Tracker write requires reconciliation.") from exc
                # Commit each worksheet separately before starting the next one.
                await _event(conn, org_id, "mck.sheet.projection.confirmed",
                             {**event_data, "result": result}, order_id)
                await conn.commit()
                results[leg] = result
            finally:
                await conn.rollback()
                await _one(conn, "SELECT pg_advisory_unlock(hashtext($1)) unlocked", lock_name)
                await conn.commit()
    return results


async def _latest_mail_state(conn, org_id: str, prefix: str, *, source: str | None = None,
                             order_id: str | None = None) -> str:
    types = [f"{prefix}.{suffix}" for suffix in ("sent", "dispatching", "uncertain", "retryable")]
    if source is not None:
        selector, value = "payload->>'source_reference'=$3", source
    else:
        selector, value = "order_id=$3::uuid", order_id
    row = await _one(
        conn,
        "SELECT event_type FROM workflow_events WHERE org_id=$1::uuid "
        "AND event_type=ANY($2) AND " + selector +
        " ORDER BY created_at DESC,CASE WHEN event_type LIKE '%.sent' THEN 4 "
        "WHEN event_type LIKE '%.retryable' THEN 3 WHEN event_type LIKE '%.uncertain' "
        "THEN 2 ELSE 1 END DESC,id DESC LIMIT 1",
        org_id, types, value,
    )
    return str((row or {}).get("event_type") or "").rsplit(".", 1)[-1]


async def _deliver_mail(conn, *, org_id: str, order_id: str, prefix: str,
                        event_data: dict[str, Any], sender, recipients: list[str],
                        subject: str, body: str) -> dict[str, Any]:
    data = {**event_data, "attempt_id": str(uuid.uuid4())}
    await _event(conn, org_id, f"{prefix}.dispatching", data, order_id)
    await conn.commit()
    try:
        message_id = await sender.send_message(
            to_addresses=recipients, subject=subject, content=body, mail_format="plaintext"
        )
        if not message_id:
            raise ZohoMailSendUncertain("Mail transport returned no message ID")
    except ZohoMailSendUncertain as exc:
        suffix, status, reason = "uncertain", "uncertain", type(exc).__name__
    except BusinessMailError as exc:
        # The transport authenticates BEFORE attempting /messages. Only this known
        # pre-send failure may become retryable. Preserve every prior attempt event.
        suffix, status, reason = "retryable", "failed", type(exc).__name__
    except Exception as exc:
        suffix, status, reason = "uncertain", "uncertain", type(exc).__name__
    else:
        try:
            await _event(conn, org_id, f"{prefix}.sent", {**data, "message_id": message_id}, order_id)
            await conn.commit()
        except Exception:
            await conn.rollback()
            # The committed dispatching receipt prevents a duplicate after a lost DB acknowledgment.
            return {"status": "uncertain", "reason": "Reconcile accepted mail receipt"}
        return {"status": "confirmed", "message_id": message_id}
    await conn.rollback()
    await _event(conn, org_id, f"{prefix}.{suffix}", {**data, "reason": reason}, order_id)
    await conn.commit()
    return {"status": status, "reason": (
        "Mail was not attempted; retry is permitted" if suffix == "retryable"
        else "Mail delivery requires reconciliation"
    )}



async def _send_welcome(
    db, client: httpx.AsyncClient, payload: MckIntakePayload, *,
    org_id: str, record_id: str, order_id: str | None,
) -> dict[str, Any]:
    if not order_id:
        return {"status": "blocked", "reason": "SPEAR record is not confirmed"}
    if not payload.email:
        return {"status": "blocked", "missing": ["Email"]}
    lock_name = f"mck-welcome:{org_id}:{payload.source_reference}"
    async with db.connection() as conn:
        lock = await _one(conn, "SELECT pg_try_advisory_lock(hashtext($1)) locked", lock_name)
        if not lock or not lock.get("locked"):
            return {"status": "in_progress"}
        try:
            state = await _latest_mail_state(conn, org_id, "mck.welcome", source=payload.source_reference)
            if state == "sent":
                return {"status": "already_sent"}
            if state in {"dispatching", "uncertain"}:
                return {"status": "uncertain", "reason": "Reconcile the previous send in Zoho"}
            subject, body = build_welcome_email(
                first_name=payload.first_name, insurance_name=payload.insurance_plan,
                provider_summary=_provider(payload) if payload.provider_name else None,
                needs_dob=not bool(payload.date_of_birth), needs_provider=not bool(payload.provider_name),
                needs_insurance=not bool(payload.member_id), needs_id=True,
                needs_address=not all((payload.address_line1, payload.city, payload.state, payload.zip_code)),
            )
            try:
                sender = ZohoMailSender(client, ZohoConfig.from_env())
            except BusinessMailError:
                return {"status": "failed", "reason": "Zoho mail configuration is incomplete"}
            return await _deliver_mail(
                conn, org_id=org_id, order_id=order_id, prefix="mck.welcome",
                event_data={"source_reference": payload.source_reference, "record_id": record_id},
                sender=sender, recipients=[payload.email], subject=subject, body=body,
            )
        finally:
            await conn.rollback()
            await _one(conn, "SELECT pg_advisory_unlock(hashtext($1)) unlocked", lock_name)
            await conn.commit()


@router.post("/api/v1/mck/intake")
async def mck_intake(payload: MckIntakePayload, request: Request):
    _internal(request)
    org_id = _org_id()
    db = request.app.state.db_pool
    if db is None:
        raise HTTPException(503, "SPEAR database is unavailable")

    record_id = payload.record_id or stable_record_id(payload.source_reference)
    outstanding = _outstanding(payload)
    results: dict[str, Any] = {
        "record_id": record_id,
        "source_reference": payload.source_reference,
        "spear": {"status": "pending"},
        "sheet": {"status": "pending"},
        "welcome": {"status": "pending"},
    }

    spear: dict[str, Any] | None = None
    if not payload.date_of_birth:
        results["spear"] = {"status": "blocked", "missing": ["DOB"]}
        async with db.connection() as conn:
            if not await _source_event_exists(
                conn, org_id, "mck.intake.spear_blocked", payload.source_reference
            ):
                await _event(
                    conn,
                    org_id,
                    "mck.intake.spear_blocked",
                    {
                        "source_reference": payload.source_reference,
                        "record_id": record_id,
                        "missing": ["DOB"],
                    },
                )
    else:
        try:
            spear = await _spear_upsert(db, payload, org_id=org_id, record_id=record_id)
            results["spear"] = {"status": "confirmed", **spear}
        except IdentityConflict as exc:
            results["spear"] = {"status": "blocked", "reason": str(exc)}
            async with db.connection() as conn:
                await _event(
                    conn,
                    org_id,
                    "mck.intake.identity_conflict",
                    {
                        "source_reference": payload.source_reference,
                        "record_id": record_id,
                        "reason": str(exc),
                    },
                )
        except Exception as exc:
            logger.warning(
                "mck_intake_spear_failed source_reference_hash=%s type=%s",
                stable_record_id(payload.source_reference),
                type(exc).__name__,
            )
            results["spear"] = {"status": "failed", "reason": "SPEAR intake requires review"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            if results["spear"].get("reason") and results["spear"]["status"] == "blocked":
                raise ZohoSheetError("Patient identity requires reconciliation before projection.", 409)
            projected = await _sheet_project(
                client, payload, record_id, spear, outstanding, db=db, org_id=org_id
            )
            results["sheet"] = {"status": "confirmed", **projected}
            async with db.connection() as conn:
                await _event(
                    conn,
                    org_id,
                    "mck.sheet.projected",
                    {
                        "source_reference": payload.source_reference,
                        "record_id": record_id,
                        **projected,
                    },
                    str((spear or {}).get("order_id") or "") or None,
                )
        except ZohoSheetWriteUncertain:
            results["sheet"] = {"status": "uncertain", "reason": "Reconcile tracker write before retry"}
        except Exception:
            results["sheet"] = {"status": "failed", "reason": "Tracker projection requires review"}

        results["welcome"] = await _send_welcome(
            db,
            client,
            payload,
            org_id=org_id,
            record_id=record_id,
            order_id=str((spear or {}).get("order_id") or "") or None,
        )

    statuses = {results[key]["status"] for key in ("spear", "sheet", "welcome")}
    results["complete"] = statuses <= {"confirmed", "already_sent"}
    return JSONResponse(status_code=200 if results["complete"] else 207, content=results)


def _recipients() -> list[str]:
    raw = os.getenv("MCK_PAID_NOTIFICATION_RECIPIENTS", "").strip()
    if not raw:
        raise ValueError("MCK_PAID_NOTIFICATION_RECIPIENTS is not configured")
    return normalize_recipients(raw, internal_only=True)


def _address(row: dict[str, Any]) -> dict[str, Any]:
    raw = row.get("address")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = {}
    raw = raw if isinstance(raw, dict) else {}
    return {
        "address_line1": row.get("address_line1") or raw.get("line1") or raw.get("street"),
        "address_line2": row.get("address_line2") or raw.get("line2"),
        "city": row.get("city") or raw.get("city"),
        "state": row.get("state") or raw.get("state"),
        "zip_code": row.get("zip_code") or raw.get("zip") or raw.get("postal_code"),
    }


async def _send_paid(app, row: dict[str, Any]) -> str:
    order_id, org_id = str(row["id"]), str(row["org_id"])
    if org_id != _org_id():
        return "blocked"
    db = app.state.db_pool
    lock_name = f"mck-paid:{order_id}"
    async with db.connection() as conn:
        lock = await _one(conn, "SELECT pg_try_advisory_lock(hashtext($1)) locked", lock_name)
        if not lock or not lock.get("locked"):
            return "locked"
        try:
            state = await _latest_mail_state(conn, org_id, "mck.payment_notification", order_id=order_id)
            if state in {"sent", "uncertain", "dispatching"}:
                return "already_handled"
            current = await _one(conn,
                "SELECT status,paid_amount FROM orders WHERE id=$1::uuid AND org_id=$2::uuid",
                order_id, org_id)
            if not current or current["status"] != "paid" or (current.get("paid_amount") or 0) <= 0:
                return "blocked"
            try:
                subject, body = build_paid_notification(
                    f"{row.get('first_name') or ''} {row.get('last_name') or ''}", _address(row))
                recipients = _recipients()
                config = ZohoConfig.from_env()
            except (ValueError, BusinessMailError):
                await _event(conn, org_id, "mck.payment_notification.blocked",
                             {"reason": "Verify address, recipients and Zoho configuration"}, order_id)
                await conn.commit()
                return "blocked"
            async with httpx.AsyncClient(timeout=30.0) as client:
                result = await _deliver_mail(
                    conn, org_id=org_id, order_id=order_id, prefix="mck.payment_notification",
                    event_data={"recipient_count": len(recipients),
                                "paid_at": str(row.get("paid_at") or row.get("payment_date") or "")},
                    sender=ZohoMailSender(client, config), recipients=recipients,
                    subject=subject, body=body,
                )
            return "sent" if result["status"] == "confirmed" else result["status"]
        finally:
            await conn.rollback()
            await _one(conn, "SELECT pg_advisory_unlock(hashtext($1)) unlocked", lock_name)
            await conn.commit()


async def dispatch_paid_notifications(app, *, limit: int = 25) -> dict[str, int]:
    counts = {"checked": 0, "sent": 0, "blocked": 0, "failed": 0,
              "uncertain": 0, "already_handled": 0, "locked": 0}
    if os.getenv("MCK_PAID_NOTIFICATION_ENABLED", "false").lower() != "true":
        return {**counts, "disabled": 1}
    org_id = _org_id()
    db = app.state.db_pool
    if db is None:
        raise RuntimeError("SPEAR database is unavailable")
    async with db.connection() as conn:
        rows = await _all(conn, """
            SELECT o.id,o.org_id,o.paid_amount,o.payment_date,o.paid_at,
                   p.first_name,p.last_name,p.address_line1,p.address_line2,
                   p.city,p.state,p.zip_code,p.address
            FROM orders o JOIN patients p ON p.id=o.patient_id AND p.org_id=o.org_id
            WHERE o.org_id=$1::uuid AND o.status='paid' AND COALESCE(o.paid_amount,0)>0
              AND (lower(COALESCE(o.product_category,'')) LIKE '%mommy%'
                OR lower(COALESCE(o.product_category,'')) LIKE '%maternity%'
                OR lower(COALESCE(o.source,'')) LIKE '%mommy%'
                OR COALESCE(o.intake_payload->>'mck_record_id','')<>'')
              AND COALESCE((
                  SELECT w.event_type FROM workflow_events w
                  WHERE w.order_id=o.id AND w.org_id=o.org_id
                    AND w.event_type IN ('mck.payment_notification.sent',
                        'mck.payment_notification.uncertain', 'mck.payment_notification.dispatching',
                        'mck.payment_notification.retryable')
                  ORDER BY w.created_at DESC,
                    CASE WHEN w.event_type LIKE '%.sent' THEN 4
                         WHEN w.event_type LIKE '%.retryable' THEN 3
                         WHEN w.event_type LIKE '%.uncertain' THEN 2 ELSE 1 END DESC,w.id DESC LIMIT 1
              ),'') NOT IN ('mck.payment_notification.sent',
                           'mck.payment_notification.uncertain','mck.payment_notification.dispatching')
            ORDER BY COALESCE((SELECT max(w.created_at) FROM workflow_events w
                    WHERE w.order_id=o.id AND w.event_type IN
                    ('mck.payment_notification.blocked','mck.payment_notification.retryable')),
                    'epoch'::timestamptz),
                     COALESCE(o.paid_at,o.payment_date::timestamptz,o.updated_at),o.id
            LIMIT $2
            """, org_id, limit)
    counts["checked"] = len(rows)
    for row in rows:
        result = await _send_paid(app, row)
        counts[result] = counts.get(result, 0) + 1
    return counts


@router.post("/api/v1/mck/paid-notifications/run")
async def paid_notification_run(payload: PaidDispatchRequest, request: Request):
    _internal(request)
    return await dispatch_paid_notifications(request.app, limit=payload.limit)


async def mck_paid_notification_worker(app) -> None:
    if os.getenv("MCK_PAID_NOTIFICATION_ENABLED", "false").lower() != "true":
        return
    try:
        interval = max(30, int(os.getenv("MCK_PAID_NOTIFICATION_POLL_SECONDS", "60")))
    except ValueError:
        interval = 60
    await asyncio.sleep(10)
    while True:
        try:
            result = await dispatch_paid_notifications(app)
            if result["sent"] or result["uncertain"]:
                logger.info(
                    "mck_paid_notification_run checked=%s sent=%s blocked=%s uncertain=%s",
                    result["checked"],
                    result["sent"],
                    result["blocked"],
                    result["uncertain"],
                )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning(
                "mck_paid_notification_worker_error type=%s",
                type(exc).__name__,
            )
        await asyncio.sleep(interval)


def _register_worker() -> None:
    for module_name in ("services.core.main", "main", "__main__"):
        module = sys.modules.get(module_name)
        app = getattr(module, "app", None) if module else None
        if app is None:
            continue
        hooks = list(getattr(app, "service_background_tasks", []))
        if mck_paid_notification_worker not in hooks:
            hooks.append(mck_paid_notification_worker)
        app.service_background_tasks = hooks
        return


_register_worker()
