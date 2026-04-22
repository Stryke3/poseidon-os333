"""
POSEIDON LITE — minimal patient repository + compliance document generator.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional

import asyncpg
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field

import trident30
from trident30_v1 import build_router as build_trident30_v1_router

APP_NAME = "poseidon-lite"

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSEIDON_DATABASE_URL", "")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "")
DEFAULT_DATA_ROOT = "/app/data/lite_files" if Path("/app").exists() else str(Path(__file__).resolve().parents[2] / "data" / "lite_files")
DATA_ROOT = Path(os.environ.get("LITE_DATA_DIR", DEFAULT_DATA_ROOT))

DOC_CATEGORIES = frozenset(
    {
        "intake",
        "insurance",
        "rx",
        "swo",
        "pod",
        "medical_records",
        "billing",
        "other",
    }
) | trident30.TRIDENT_DOC_CLASSES

GENERATE_TYPES = frozenset({"swo", "transmittal", "checklist", "billing-summary"})

_pool: Optional[asyncpg.Pool] = None


async def ensure_schema(conn: asyncpg.Connection) -> None:
    await conn.execute(
        """
        CREATE SCHEMA IF NOT EXISTS lite;
        CREATE TABLE IF NOT EXISTS lite.patients (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            first_name TEXT NOT NULL DEFAULT '',
            last_name TEXT NOT NULL DEFAULT '',
            dob DATE,
            phone TEXT,
            email TEXT,
            address TEXT,
            payer_name TEXT,
            member_id TEXT,
            ordering_provider TEXT,
            diagnosis_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
            hcpcs_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS lite.patient_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            patient_id UUID NOT NULL REFERENCES lite.patients(id) ON DELETE CASCADE,
            category TEXT NOT NULL,
            filename TEXT NOT NULL,
            storage_path TEXT NOT NULL,
            mime_type TEXT,
            uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        );
        CREATE INDEX IF NOT EXISTS idx_lite_patient_documents_patient
            ON lite.patient_documents (patient_id);
        CREATE TABLE IF NOT EXISTS lite.generated_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            patient_id UUID NOT NULL REFERENCES lite.patients(id) ON DELETE CASCADE,
            document_type TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            file_path TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        );
        CREATE INDEX IF NOT EXISTS idx_lite_generated_documents_patient
            ON lite.generated_documents (patient_id);
        """
    )
    await trident30.ensure_trident30_schema(conn)


def require_api_key(x_internal_api_key: Optional[str] = Header(None)) -> None:
    if not INTERNAL_API_KEY:
        return
    if x_internal_api_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    return _pool


app = FastAPI(title=APP_NAME, version="1.0.0")


@app.on_event("startup")
async def startup() -> None:
    global _pool
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required")
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    async with _pool.acquire() as conn:
        await ensure_schema(conn)


@app.on_event("shutdown")
async def shutdown() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": APP_NAME}


@app.get("/ready")
async def ready(pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, str]:
    async with pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ready"}


def _row_patient(r: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "first_name": r["first_name"],
        "last_name": r["last_name"],
        "dob": r["dob"].isoformat() if r["dob"] else None,
        "phone": r["phone"],
        "email": r["email"],
        "address": r["address"],
        "payer_name": r["payer_name"],
        "member_id": r["member_id"],
        "ordering_provider": r["ordering_provider"],
        "diagnosis_codes": r["diagnosis_codes"] if r["diagnosis_codes"] is not None else [],
        "hcpcs_codes": r["hcpcs_codes"] if r["hcpcs_codes"] is not None else [],
        "notes": r["notes"],
        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
    }


class PatientCreate(BaseModel):
    first_name: str = ""
    last_name: str = ""
    dob: Optional[date] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    payer_name: Optional[str] = None
    member_id: Optional[str] = None
    ordering_provider: Optional[str] = None
    diagnosis_codes: list[str] = Field(default_factory=list)
    hcpcs_codes: list[str] = Field(default_factory=list)
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    dob: Optional[date] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    payer_name: Optional[str] = None
    member_id: Optional[str] = None
    ordering_provider: Optional[str] = None
    diagnosis_codes: Optional[list[str]] = None
    hcpcs_codes: Optional[list[str]] = None
    notes: Optional[str] = None


def _safe_filename(name: str) -> str:
    base = Path(name).name
    if not base or base in (".", ".."):
        return "upload.bin"
    return re.sub(r"[^a-zA-Z0-9._-]", "_", base)[:200]


app.include_router(
    build_trident30_v1_router(get_pool, DATA_ROOT, _safe_filename), dependencies=[Depends(require_api_key)]
)


def _json_list(v: Any) -> list[str]:
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x) for x in v]
    return []


def generate_swo_content(p: dict[str, Any], generated_at: datetime) -> str:
    dx = ", ".join(_json_list(p.get("diagnosis_codes"))) or "(none)"
    hc = ", ".join(_json_list(p.get("hcpcs_codes"))) or "(none)"
    lines = [
        "STANDARD WRITTEN ORDER (SWO) — DRAFT",
        "",
        f"Date generated: {generated_at.strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "PATIENT IDENTIFIERS",
        f"  Name: {p.get('first_name', '')} {p.get('last_name', '')}".strip(),
        f"  DOB: {p.get('dob') or ''}",
        f"  Phone: {p.get('phone') or ''}",
        f"  Email: {p.get('email') or ''}",
        f"  Address: {p.get('address') or ''}",
        "",
        "ORDERING / TREATING PROVIDER",
        f"  {p.get('ordering_provider') or '(not specified)'}",
        "",
        "DIAGNOSIS (ICD-10 / diagnosis codes as recorded)",
        f"  {dx}",
        "",
        "ITEMS / HCPCS REQUESTED",
        f"  {hc}",
        "",
        "NOTES",
        f"  {p.get('notes') or '(none)'}",
        "",
        "SIGNATURE (ordering provider)",
        "  _________________________________________  Date: _______________",
        "",
        "This draft is generated for compliance review and does not replace a signed SWO on file.",
    ]
    return "\n".join(lines)


def generate_transmittal_content(
    p: dict[str, Any],
    uploads: list[dict[str, Any]],
    generated_at: datetime,
) -> str:
    name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
    enclosed = []
    for u in uploads:
        enclosed.append(f"  - [{u.get('category')}] {u.get('filename')}")
    if not enclosed:
        enclosed = ["  (no documents uploaded yet — attach before sending)"]
    lines = [
        "PHYSICIAN TRANSMITTAL / SIGNATURE COVER SHEET",
        "",
        f"Date: {generated_at.strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "Cover note:",
        "  Please review and sign the enclosed order as applicable. Return signed",
        "  documentation to our office for the patient record and billing compliance.",
        "",
        f"Patient: {name or '(unknown)'}",
        f"DOB: {p.get('dob') or ''}",
        f"Member ID: {p.get('member_id') or ''}",
        f"Payer: {p.get('payer_name') or ''}",
        "",
        "Requested signature:",
        "  Ordering / treating physician signature on SWO and related orders as listed.",
        "",
        "Enclosed documents (repository):",
        *enclosed,
        "",
        "Thank you,",
        "  _____________________________",
    ]
    return "\n".join(lines)


def generate_checklist_content(p: dict[str, Any], uploads: list[dict[str, Any]], gen: list[dict[str, Any]]) -> str:
    cats = {u.get("category") for u in uploads}
    has_swo_upload = "swo" in cats
    has_rx = "rx" in cats
    has_pod = "pod" in cats

    def has_generated(dtype: str) -> bool:
        return any(g.get("document_type") == dtype for g in gen)

    checks = [
        ("Demographics complete (name, DOB, contact)", bool(p.get("first_name") and p.get("last_name") and p.get("dob"))),
        ("Payer info complete (payer name, member ID)", bool(p.get("payer_name") and p.get("member_id"))),
        ("Diagnosis present", bool(_json_list(p.get("diagnosis_codes")))),
        ("HCPCS present", bool(_json_list(p.get("hcpcs_codes")))),
        ("Ordering provider present", bool(p.get("ordering_provider"))),
        ("Rx uploaded", has_rx),
        ("SWO generated (draft in system)", has_generated("swo")),
        ("Signed SWO received (uploaded)", has_swo_upload),
        ("POD received if applicable", has_pod),
        ("Billing ready (codes + payer + provider)", bool(_json_list(p.get("hcpcs_codes")) and p.get("payer_name") and p.get("ordering_provider"))),
    ]
    lines = [
        "INTERNAL COMPLIANCE CHECKLIST",
        f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
    ]
    for label, ok in checks:
        lines.append(f"[{'x' if ok else ' '}] {label}")
    lines.append("")
    lines.append("Notes: Review each item before claim submission or audit.")
    return "\n".join(lines)


def generate_billing_summary_content(
    p: dict[str, Any],
    uploads: list[dict[str, Any]],
    generated: list[dict[str, Any]],
) -> str:
    name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
    dx = ", ".join(_json_list(p.get("diagnosis_codes"))) or "(none)"
    hc = ", ".join(_json_list(p.get("hcpcs_codes"))) or "(none)"
    repo_lines = []
    for u in uploads:
        repo_lines.append(f"  - [{u.get('category')}] {u.get('filename')} (uploaded)")
    for g in generated:
        repo_lines.append(f"  - [{g.get('document_type')}] generated {g.get('created_at', '')}")
    if not repo_lines:
        repo_lines = ["  (no files in repository yet)"]
    readiness = []
    if not p.get("member_id"):
        readiness.append("Add member ID")
    if not p.get("payer_name"):
        readiness.append("Add payer name")
    if not _json_list(p.get("hcpcs_codes")):
        readiness.append("Add HCPCS codes")
    if not _json_list(p.get("diagnosis_codes")):
        readiness.append("Add diagnosis codes")
    if not readiness:
        readiness = ["Core billing fields appear present — verify against payer policy"]
    lines = [
        "BILLING PACKET SUMMARY",
        f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "Patient identity",
        f"  {name}",
        f"  DOB: {p.get('dob') or ''}",
        f"  Phone: {p.get('phone') or ''}",
        "",
        "Payer identity",
        f"  {p.get('payer_name') or '(not specified)'}",
        f"  Member ID: {p.get('member_id') or '(not specified)'}",
        "",
        "Codes",
        f"  Diagnosis: {dx}",
        f"  HCPCS: {hc}",
        "",
        "Ordering / treating provider",
        f"  {p.get('ordering_provider') or '(not specified)'}",
        "",
        "Linked repository files",
        *repo_lines,
        "",
        "Readiness notes",
        *[f"  - {r}" for r in readiness],
        "",
        p.get("notes") and f"Additional notes from record:\n  {p.get('notes')}" or "",
    ]
    return "\n".join(lines).strip() + "\n"


@app.post("/patients", dependencies=[Depends(require_api_key)])
async def create_patient(body: PatientCreate, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO lite.patients (
                first_name, last_name, dob, phone, email, address,
                payer_name, member_id, ordering_provider,
                diagnosis_codes, hcpcs_codes, notes
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12)
            RETURNING *
            """,
            body.first_name,
            body.last_name,
            body.dob,
            body.phone,
            body.email,
            body.address,
            body.payer_name,
            body.member_id,
            body.ordering_provider,
            json.dumps(body.diagnosis_codes),
            json.dumps(body.hcpcs_codes),
            body.notes,
        )
    return _row_patient(row)


@app.get("/patients", dependencies=[Depends(require_api_key)])
async def list_patients(
    q: Optional[str] = Query(None),
    pool: asyncpg.Pool = Depends(get_pool),
) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        if q and q.strip():
            term = f"%{q.strip().lower()}%"
            rows = await conn.fetch(
                """
                SELECT * FROM lite.patients
                WHERE lower(first_name || ' ' || last_name) LIKE $1
                   OR lower(coalesce(email,'')) LIKE $1
                   OR lower(coalesce(phone,'')) LIKE $1
                   OR lower(coalesce(member_id,'')) LIKE $1
                ORDER BY updated_at DESC
                LIMIT 500
                """,
                term,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM lite.patients ORDER BY updated_at DESC LIMIT 500"
            )
    return [_row_patient(r) for r in rows]


@app.get("/patients/{patient_id}", dependencies=[Depends(require_api_key)])
async def get_patient(patient_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM lite.patients WHERE id = $1", patient_id)
    if not row:
        raise HTTPException(status_code=404, detail="Patient not found")
    return _row_patient(row)


@app.put("/patients/{patient_id}", dependencies=[Depends(require_api_key)])
async def update_patient(
    patient_id: uuid.UUID,
    body: PatientUpdate,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, Any]:
    # Only keys present in the JSON body; allows clearing nullable fields with explicit null.
    raw = body.model_dump(exclude_unset=True)
    if not raw:
        return await get_patient(patient_id, pool)
    sets = []
    args: list[Any] = []
    i = 1
    for key, val in raw.items():
        if key in ("diagnosis_codes", "hcpcs_codes"):
            sets.append(f"{key} = ${i}::jsonb")
            args.append(json.dumps(val if val is not None else []))
        else:
            sets.append(f"{key} = ${i}")
            args.append(val)
        i += 1
    sets.append("updated_at = NOW()")
    args.append(patient_id)
    sql = f"UPDATE lite.patients SET {', '.join(sets)} WHERE id = ${i} RETURNING *"
    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, *args)
    if not row:
        raise HTTPException(status_code=404, detail="Patient not found")
    return _row_patient(row)


def _row_upload(r: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "patient_id": str(r["patient_id"]),
        "category": r["category"],
        "filename": r["filename"],
        "storage_path": r["storage_path"],
        "mime_type": r["mime_type"],
        "uploaded_at": r["uploaded_at"].isoformat() if r["uploaded_at"] else None,
        "metadata": r["metadata"] if isinstance(r["metadata"], dict) else {},
    }


def _row_generated(r: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "patient_id": str(r["patient_id"]),
        "document_type": r["document_type"],
        "content": r["content"],
        "file_path": r["file_path"],
        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        "metadata": r["metadata"] if isinstance(r["metadata"], dict) else {},
    }


@app.post("/patients/{patient_id}/documents", dependencies=[Depends(require_api_key)])
async def upload_document(
    patient_id: uuid.UUID,
    category: str = Form(...),
    file: UploadFile = File(...),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, Any]:
    if category not in DOC_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Allowed: {sorted(DOC_CATEGORIES)}")
    async with pool.acquire() as conn:
        exists = await conn.fetchval("SELECT 1 FROM lite.patients WHERE id = $1", patient_id)
        if not exists:
            raise HTTPException(status_code=404, detail="Patient not found")
    safe = _safe_filename(file.filename or "upload")
    uid = uuid.uuid4()
    patient_dir = DATA_ROOT / str(patient_id) / "uploads"
    patient_dir.mkdir(parents=True, exist_ok=True)
    dest = patient_dir / f"{uid}_{safe}"
    content = await file.read()
    dest.write_bytes(content)
    rel = str(dest.relative_to(DATA_ROOT))
    mime = file.content_type
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO lite.patient_documents (patient_id, category, filename, storage_path, mime_type, metadata)
            VALUES ($1, $2, $3, $4, $5, '{}'::jsonb)
            RETURNING *
            """,
            patient_id,
            category,
            safe,
            rel,
            mime,
        )
        await conn.execute(
            "UPDATE lite.patients SET updated_at = NOW() WHERE id = $1",
            patient_id,
        )
    return _row_upload(row)


@app.get("/patients/{patient_id}/documents", dependencies=[Depends(require_api_key)])
async def list_documents(
    patient_id: uuid.UUID,
    pool: asyncpg.Pool = Depends(get_pool),
) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        exists = await conn.fetchval("SELECT 1 FROM lite.patients WHERE id = $1", patient_id)
        if not exists:
            raise HTTPException(status_code=404, detail="Patient not found")
        rows = await conn.fetch(
            "SELECT * FROM lite.patient_documents WHERE patient_id = $1 ORDER BY uploaded_at DESC",
            patient_id,
        )
    return [_row_upload(r) for r in rows]


@app.get("/patients/{patient_id}/documents/{doc_id}/file", dependencies=[Depends(require_api_key)])
async def download_upload(
    patient_id: uuid.UUID,
    doc_id: uuid.UUID,
    pool: asyncpg.Pool = Depends(get_pool),
) -> FileResponse:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM lite.patient_documents WHERE id = $1 AND patient_id = $2",
            doc_id,
            patient_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    path = DATA_ROOT / row["storage_path"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(path, filename=row["filename"], media_type=row["mime_type"] or "application/octet-stream")


@app.get("/patients/{patient_id}/generated", dependencies=[Depends(require_api_key)])
async def list_generated(
    patient_id: uuid.UUID,
    pool: asyncpg.Pool = Depends(get_pool),
) -> list[dict[str, Any]]:
    async with pool.acquire() as conn:
        exists = await conn.fetchval("SELECT 1 FROM lite.patients WHERE id = $1", patient_id)
        if not exists:
            raise HTTPException(status_code=404, detail="Patient not found")
        rows = await conn.fetch(
            "SELECT * FROM lite.generated_documents WHERE patient_id = $1 ORDER BY created_at DESC",
            patient_id,
        )
    return [_row_generated(r) for r in rows]


@app.get("/patients/{patient_id}/generated/{gen_id}", dependencies=[Depends(require_api_key)])
async def get_generated(
    patient_id: uuid.UUID,
    gen_id: uuid.UUID,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, Any]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM lite.generated_documents WHERE id = $1 AND patient_id = $2",
            gen_id,
            patient_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Generated document not found")
    return _row_generated(row)


@app.get("/patients/{patient_id}/generated/{gen_id}/file", dependencies=[Depends(require_api_key)])
async def download_generated_file(
    patient_id: uuid.UUID,
    gen_id: uuid.UUID,
    pool: asyncpg.Pool = Depends(get_pool),
) -> FileResponse:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM lite.generated_documents WHERE id = $1 AND patient_id = $2",
            gen_id,
            patient_id,
        )
    if not row or not row["file_path"]:
        raise HTTPException(status_code=404, detail="File not found")
    path = DATA_ROOT / row["file_path"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File missing on disk")
    fname = f"{row['document_type']}.txt"
    return FileResponse(path, filename=fname, media_type="text/plain")


async def _load_patient_and_lists(
    conn: asyncpg.Connection, patient_id: uuid.UUID
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    prow = await conn.fetchrow("SELECT * FROM lite.patients WHERE id = $1", patient_id)
    if not prow:
        raise HTTPException(status_code=404, detail="Patient not found")
    p = _row_patient(prow)
    urows = await conn.fetch(
        "SELECT * FROM lite.patient_documents WHERE patient_id = $1 ORDER BY uploaded_at",
        patient_id,
    )
    uploads = [_row_upload(r) for r in urows]
    grows = await conn.fetch(
        "SELECT * FROM lite.generated_documents WHERE patient_id = $1 ORDER BY created_at",
        patient_id,
    )
    generated = [_row_generated(r) for r in grows]
    return p, uploads, generated


@app.post("/patients/{patient_id}/generate/{kind}", dependencies=[Depends(require_api_key)])
async def generate_document(
    patient_id: uuid.UUID,
    kind: str,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict[str, Any]:
    if kind not in GENERATE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid kind. Allowed: {sorted(GENERATE_TYPES)}")

    generated_at = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        p, uploads, prior_gen = await _load_patient_and_lists(conn, patient_id)

        if kind == "swo":
            content = generate_swo_content(p, generated_at)
            dtype = "swo"
        elif kind == "transmittal":
            content = generate_transmittal_content(p, uploads, generated_at)
            dtype = "transmittal"
        elif kind == "checklist":
            content = generate_checklist_content(p, uploads, prior_gen)
            dtype = "checklist"
        else:
            content = generate_billing_summary_content(p, uploads, prior_gen)
            dtype = "billing-summary"

        patient_dir = DATA_ROOT / str(patient_id) / "generated"
        patient_dir.mkdir(parents=True, exist_ok=True)
        ts = generated_at.strftime("%Y%m%d_%H%M%S")
        fname = f"{dtype}_{ts}_{uuid.uuid4().hex[:8]}.txt"
        dest = patient_dir / fname
        dest.write_text(content, encoding="utf-8")
        rel = str(dest.relative_to(DATA_ROOT))

        row = await conn.fetchrow(
            """
            INSERT INTO lite.generated_documents (patient_id, document_type, content, file_path, metadata)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            RETURNING *
            """,
            patient_id,
            dtype,
            content,
            rel,
            json.dumps({"generated_at": generated_at.isoformat(), "kind": kind}),
        )
        await conn.execute(
            "UPDATE lite.patients SET updated_at = NOW() WHERE id = $1",
            patient_id,
        )

    return _row_generated(row)


@app.get("/patients/{patient_id}/generated/{gen_id}/preview", dependencies=[Depends(require_api_key)])
async def preview_generated(
    patient_id: uuid.UUID,
    gen_id: uuid.UUID,
    pool: asyncpg.Pool = Depends(get_pool),
) -> PlainTextResponse:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT content FROM lite.generated_documents WHERE id = $1 AND patient_id = $2",
            gen_id,
            patient_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return PlainTextResponse(row["content"] or "")
