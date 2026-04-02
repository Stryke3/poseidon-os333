"""
Unified intake normalization + patient matching for fax and form POST /patients.

Tiers: EXACT (name+DOB) → STRONG (MRN or last+DOB+phone) → UNCERTAIN (hold) → NONE (create).
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Awaitable, Callable, Optional

# --- Intake status (fax_log.intake_status) ---

INTAKE_RECEIVED = "received"
INTAKE_NORMALIZATION_COMPLETE = "normalization_complete"
INTAKE_INCOMPLETE = "intake_incomplete"
INTAKE_HELD = "held_for_review"
INTAKE_PATIENT_LINKED = "patient_linked"
INTAKE_PATIENT_CREATED = "patient_created"
INTAKE_PROCESSED = "processed"
INTAKE_CASE_CREATED = "case_created"

# Allowed transitions: inbound pipeline may move forward; manual review may resolve holds.
_INTAKE_EDGES: dict[str, set[str]] = {
    INTAKE_RECEIVED: {
        INTAKE_NORMALIZATION_COMPLETE,
        INTAKE_INCOMPLETE,
        INTAKE_HELD,
        INTAKE_PATIENT_LINKED,
        INTAKE_PATIENT_CREATED,
        INTAKE_PROCESSED,
        INTAKE_CASE_CREATED,
    },
    INTAKE_NORMALIZATION_COMPLETE: {
        INTAKE_HELD,
        INTAKE_PATIENT_LINKED,
        INTAKE_PATIENT_CREATED,
        INTAKE_PROCESSED,
        INTAKE_CASE_CREATED,
        INTAKE_INCOMPLETE,
    },
    INTAKE_INCOMPLETE: {INTAKE_HELD, INTAKE_PROCESSED, INTAKE_CASE_CREATED, INTAKE_PATIENT_LINKED, INTAKE_PATIENT_CREATED},
    INTAKE_HELD: {INTAKE_PROCESSED, INTAKE_CASE_CREATED, INTAKE_PATIENT_LINKED, INTAKE_PATIENT_CREATED, INTAKE_INCOMPLETE},
    INTAKE_PATIENT_LINKED: {INTAKE_PROCESSED, INTAKE_CASE_CREATED},
    INTAKE_PATIENT_CREATED: {INTAKE_PROCESSED, INTAKE_CASE_CREATED},
    INTAKE_PROCESSED: {INTAKE_CASE_CREATED},
    INTAKE_CASE_CREATED: set(),
}


def intake_transition_allowed(previous: str | None, new_status: str) -> bool:
    prev = (previous or INTAKE_RECEIVED).strip() or INTAKE_RECEIVED
    if prev == new_status:
        return True
    allowed = _INTAKE_EDGES.get(prev)
    if allowed is None:
        # Unknown/legacy fax_log.intake_status — do not allow arbitrary jumps.
        return False
    return new_status in allowed


class MatchTier(str, Enum):
    EXACT = "exact"
    STRONG = "strong"
    UNCERTAIN = "uncertain"
    NONE = "none"


@dataclass
class NormalizedIdentity:
    first_name: str
    last_name: str
    dob_iso: str
    phone_digits: str
    mrn: str
    normalization_complete: bool


@dataclass
class MatchOutcome:
    tier: MatchTier
    patient_id: str | None
    reason: str | None  # why uncertain / none
    strong_rule: str | None = None  # mrn | last_dob_phone | ...


FetchOne = Callable[..., Awaitable[Any]]
FetchAll = Callable[..., Awaitable[Any]]
ExecWrite = Callable[..., Awaitable[int]]


def _txt(value: Any) -> str:
    return str(value or "").strip()


def _phone_digits(value: Any) -> str:
    return re.sub(r"\D+", "", _txt(value))


def _split_name(value: Any) -> tuple[str, str]:
    raw = _txt(value)
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


def normalize_date_iso(value: str | None) -> str:
    raw = _txt(value)
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


def _split_codes(value: Any) -> list[str]:
    if isinstance(value, list):
        items = value
    else:
        items = re.split(r"[\s,]+", _txt(value))
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        code = _txt(item).upper()
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(code)
    return out


def normalize_fax_identity(
    parsed_intake: dict[str, Any],
    *,
    payload_patient_dob: str | None,
    payload_patient_name: str | None,
    payload_patient_mrn: str | None,
) -> NormalizedIdentity:
    first = _txt(parsed_intake.get("first_name"))
    last = _txt(parsed_intake.get("last_name"))
    if not first or not last:
        f2, l2 = _split_name(parsed_intake.get("patient_name"))
        first = first or _txt(f2)
        last = last or _txt(l2)
    dob_raw = _txt(parsed_intake.get("date_of_birth")) or _txt(payload_patient_dob)
    dob_iso = normalize_date_iso(dob_raw)
    phone = _phone_digits(parsed_intake.get("phone"))
    mrn = _txt(parsed_intake.get("mrn")) or _txt(payload_patient_mrn)
    if not first or not last:
        fn, ln = _split_name(payload_patient_name)
        first = first or _txt(fn)
        last = last or _txt(ln)
    placeholder_dob = dob_iso == "1970-01-01"
    norm_ok = bool(first and last and not placeholder_dob)
    return NormalizedIdentity(
        first_name=first,
        last_name=last,
        dob_iso=dob_iso,
        phone_digits=phone,
        mrn=mrn,
        normalization_complete=norm_ok,
    )


def normalize_form_identity(
    first_name: str,
    last_name: str,
    dob: str,
    phone: str | None,
) -> NormalizedIdentity:
    dob_iso = normalize_date_iso(dob)
    ph = _phone_digits(phone)
    placeholder_dob = dob_iso == "1970-01-01"
    fn = _txt(first_name)
    ln = _txt(last_name)
    return NormalizedIdentity(
        first_name=fn,
        last_name=ln,
        dob_iso=dob_iso,
        phone_digits=ph,
        mrn="",
        normalization_complete=bool(fn and ln and not placeholder_dob),
    )


async def match_patient_for_intake(
    conn: Any,
    org_id: str,
    norm: NormalizedIdentity,
    *,
    fetch_one: FetchOne,
    fetch_all: FetchAll,
) -> MatchOutcome:
    if not norm.normalization_complete:
        return MatchOutcome(MatchTier.NONE, None, "normalization_incomplete", None)

    exact = await fetch_one(
        conn,
        """
        SELECT id
        FROM patients
        WHERE org_id = $1
          AND lower(trim(first_name)) = lower(trim($2))
          AND lower(trim(last_name)) = lower(trim($3))
          AND COALESCE(date_of_birth::text, dob::text) = $4
        ORDER BY created_at DESC
        LIMIT 1
        """,
        org_id,
        norm.first_name,
        norm.last_name,
        norm.dob_iso,
    )
    if exact:
        return MatchOutcome(MatchTier.EXACT, str(exact["id"]), None, None)

    if norm.mrn:
        mrn_rows = await fetch_all(
            conn,
            """
            SELECT id, COALESCE(date_of_birth::text, dob::text) AS d
            FROM patients
            WHERE org_id = $1 AND lower(trim(coalesce(mrn, ''))) = lower(trim($2))
            ORDER BY created_at DESC
            """,
            org_id,
            norm.mrn,
        )
        if len(mrn_rows) > 1:
            return MatchOutcome(MatchTier.UNCERTAIN, None, "ambiguous_mrn", None)
        if len(mrn_rows) == 1:
            row = mrn_rows[0]
            on_file = _txt(row.get("d"))
            if on_file and on_file != norm.dob_iso:
                return MatchOutcome(MatchTier.UNCERTAIN, None, "mrn_dob_conflict", None)
            return MatchOutcome(MatchTier.STRONG, str(row["id"]), None, "mrn")

    ld_rows = await fetch_all(
        conn,
        """
        SELECT id, lower(trim(first_name)) AS fn
        FROM patients
        WHERE org_id = $1
          AND lower(trim(last_name)) = lower(trim($2))
          AND COALESCE(date_of_birth::text, dob::text) = $3
        ORDER BY created_at DESC
        """,
        org_id,
        norm.last_name,
        norm.dob_iso,
    )
    if len(ld_rows) > 1:
        return MatchOutcome(MatchTier.UNCERTAIN, None, "multiple_last_dob", None)
    if len(ld_rows) == 1:
        pid = str(ld_rows[0]["id"])
        fn_db = _txt(ld_rows[0].get("fn"))
        fn_in = norm.first_name.lower().strip()
        if fn_db == fn_in:
            return MatchOutcome(MatchTier.EXACT, pid, None, None)
        if norm.phone_digits:
            ph_row = await fetch_one(
                conn,
                """
                SELECT id
                FROM patients
                WHERE id = $1
                  AND org_id = $2
                  AND regexp_replace(coalesce(phone, ''), '[^0-9]+', '', 'g') = $3
                """,
                pid,
                org_id,
                norm.phone_digits,
            )
            if ph_row:
                return MatchOutcome(MatchTier.STRONG, pid, None, "last_dob_phone")
        return MatchOutcome(MatchTier.UNCERTAIN, None, "first_name_mismatch", None)

    return MatchOutcome(MatchTier.NONE, None, None, None)


async def create_patient_from_fax_intake(
    conn: Any,
    org_id: str,
    norm: NormalizedIdentity,
    parsed_intake: dict[str, Any],
    *,
    exec_write: ExecWrite,
) -> str:
    patient_id = str(uuid.uuid4())
    insurance_info = parsed_intake.get("insurance_info") if isinstance(parsed_intake.get("insurance_info"), dict) else {}
    codes = _split_codes(parsed_intake.get("diagnosis_codes"))
    await exec_write(
        conn,
        """
        INSERT INTO patients (id, org_id, first_name, last_name, date_of_birth, dob, insurance_id, payer_id, diagnosis_codes, phone, created_by)
        VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8::jsonb,$9,NULL)
        """,
        patient_id,
        org_id,
        norm.first_name,
        norm.last_name,
        norm.dob_iso,
        _txt(insurance_info.get("member_id")),
        _txt(insurance_info.get("payer_name")),
        json.dumps(codes),
        norm.phone_digits or None,
    )
    return patient_id


async def update_patient_from_fax_intake(
    conn: Any,
    org_id: str,
    patient_id: str,
    parsed_intake: dict[str, Any],
    *,
    exec_write: ExecWrite,
) -> None:
    insurance_info = parsed_intake.get("insurance_info") if isinstance(parsed_intake.get("insurance_info"), dict) else {}
    codes = _split_codes(parsed_intake.get("diagnosis_codes"))
    phone = _phone_digits(parsed_intake.get("phone"))
    await exec_write(
        conn,
        """
        UPDATE patients
        SET phone = COALESCE(NULLIF(trim($1), ''), phone),
            insurance_id = COALESCE(NULLIF(trim($2), ''), insurance_id),
            payer_id = COALESCE(NULLIF(trim($3), ''), payer_id),
            diagnosis_codes = CASE WHEN jsonb_array_length($4::jsonb) > 0 THEN $4::jsonb ELSE diagnosis_codes END,
            updated_at = NOW()
        WHERE id = $5 AND org_id = $6
        """,
        phone or None,
        _txt(insurance_info.get("member_id")),
        _txt(insurance_info.get("payer_name")),
        json.dumps(codes),
        patient_id,
        org_id,
    )


async def resolve_fax_patient_with_pipeline(
    conn: Any,
    org_id: str,
    parsed_intake: dict[str, Any],
    *,
    payload_patient_dob: str | None,
    payload_patient_name: str | None,
    payload_patient_mrn: str | None,
    intake_incomplete: bool,
    fetch_one: FetchOne,
    fetch_all: FetchAll,
    exec_write: ExecWrite,
    record_workflow_event: Callable[..., Awaitable[None]],
    fax_sinch_id: str | None,
) -> tuple[str | None, str, str | None]:
    """
    Returns (patient_id_or_none, intake_status, hold_reason).
    intake_incomplete: skip all patient writes (OCR gate).
    """
    if intake_incomplete:
        return None, INTAKE_INCOMPLETE, None

    norm = normalize_fax_identity(
        parsed_intake,
        payload_patient_dob=payload_patient_dob,
        payload_patient_name=payload_patient_name,
        payload_patient_mrn=payload_patient_mrn,
    )
    if not norm.normalization_complete:
        return None, INTAKE_HELD, "identity_not_normalized"

    outcome = await match_patient_for_intake(conn, org_id, norm, fetch_one=fetch_one, fetch_all=fetch_all)

    if outcome.tier == MatchTier.UNCERTAIN:
        return None, INTAKE_HELD, outcome.reason or "uncertain_match"

    if outcome.tier in (MatchTier.EXACT, MatchTier.STRONG) and outcome.patient_id:
        await update_patient_from_fax_intake(
            conn, org_id, outcome.patient_id, parsed_intake, exec_write=exec_write
        )
        return outcome.patient_id, INTAKE_PATIENT_LINKED, None

    if outcome.tier == MatchTier.NONE:
        pid = await create_patient_from_fax_intake(conn, org_id, norm, parsed_intake, exec_write=exec_write)
        await record_workflow_event(
            conn,
            org_id,
            "patient.created_from_fax",
            {"patient_id": pid, "fax_sinch_id": fax_sinch_id},
            order_id=None,
        )
        return pid, INTAKE_PATIENT_CREATED, None

    return None, INTAKE_HELD, "no_resolution"


async def match_form_patient_for_intake(
    conn: Any,
    org_id: str,
    norm: NormalizedIdentity,
    *,
    fetch_one: FetchOne,
    fetch_all: FetchAll,
) -> MatchOutcome:
    """Same matching rules as fax; used by POST /patients."""
    return await match_patient_for_intake(conn, org_id, norm, fetch_one=fetch_one, fetch_all=fetch_all)
