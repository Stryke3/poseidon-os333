"""
TRIDENT 3.0 JSON API (mounted at /api/v1). Order id == lite.patients.id.
"""

import json
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

import asyncpg
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

import trident30
from trident30 import build_readiness, build_rule_hits, infer_queue_bucket, log_audit, row_workflow

GenFn = Callable[[], Awaitable[asyncpg.Pool]]


def _row_patient_dict(r: asyncpg.Record) -> dict[str, Any]:
    d = {
        "id": str(r["id"]),
        "first_name": r.get("first_name") or "",
        "last_name": r.get("last_name") or "",
        "dob": r["dob"].isoformat() if r.get("dob") else None,
        "phone": r.get("phone"),
        "email": r.get("email"),
        "address": r.get("address"),
        "payer_name": r.get("payer_name"),
        "member_id": r.get("member_id"),
        "ordering_provider": r.get("ordering_provider"),
        "diagnosis_codes": trident30._json_list(r.get("diagnosis_codes")),
        "hcpcs_codes": trident30._json_list(r.get("hcpcs_codes")),
        "notes": r.get("notes"),
    }
    return d


def _r_upload(r: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "order_id": str(r["patient_id"]),
        "category": r["category"],
        "filename": r["filename"],
        "storage_path": r["storage_path"],
        "mime_type": r.get("mime_type"),
        "uploaded_at": r["uploaded_at"].isoformat() if r.get("uploaded_at") else None,
        "metadata": r.get("metadata") or {},
    }


def _r_gen(r: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "order_id": str(r["patient_id"]),
        "document_type": r["document_type"],
        "content": r.get("content") or "",
        "file_path": r.get("file_path"),
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        "metadata": r.get("metadata") or {},
    }


async def _ensure_workflow_row(conn: asyncpg.Connection, oid: uuid.UUID) -> asyncpg.Record:
    r = await conn.fetchrow("SELECT * FROM lite.order_workflow WHERE order_id = $1", oid)
    if r:
        return r
    await conn.execute("INSERT INTO lite.order_workflow (order_id) VALUES ($1) ON CONFLICT (order_id) DO NOTHING", oid)
    r2 = await conn.fetchrow("SELECT * FROM lite.order_workflow WHERE order_id = $1", oid)
    if not r2:
        raise HTTPException(status_code=500, detail="workflow missing")
    return r2


def _validate_enum(v: Optional[str], allowed: frozenset, name: str) -> None:
    if v is None:
        return
    if v not in allowed:
        raise HTTPException(status_code=400, detail=f"invalid {name}")


def build_router(get_pool: GenFn, data_root: Path, safe_name: Callable[[str], str]) -> APIRouter:
    r = APIRouter(prefix="/api/v1", tags=["trident30"])
    dr = data_root
    _sn = safe_name

    @r.post("/intake/upload")
    async def intake_upload(
        file: UploadFile = File(...),
        document_class: str = Form("intake"),
        order_id: Optional[uuid.UUID] = Form(None),
        pool: asyncpg.Pool = Depends(get_pool),
    ) -> dict[str, Any]:
        if document_class not in trident30.TRIDENT_DOC_CLASSES:
            raise HTTPException(
                status_code=400, detail="invalid document_class; see TRIDENT_DOC_CLASSES",
            )
        async with pool.acquire() as conn:
            if order_id is None:
                new_id = await conn.fetchval(
                    "INSERT INTO lite.patients (first_name, last_name) VALUES ('', '') RETURNING id"
                )
                o = uuid.UUID(str(new_id))
                await _ensure_workflow_row(conn, o)
                await log_audit(conn, o, "intake_creates_order", {"document_class": document_class})
            else:
                o = order_id
                ex = await conn.fetchval("SELECT 1 FROM lite.patients WHERE id = $1", o)
                if not ex:
                    raise HTTPException(status_code=404, detail="order not found")
                await _ensure_workflow_row(conn, o)
        name = _sn(file.filename or "upload")
        doc_uid = uuid.uuid4()
        pdir = dr / str(o) / "uploads"
        pdir.mkdir(parents=True, exist_ok=True)
        pth = pdir / f"{doc_uid}_{name}"
        pth.write_bytes(await file.read())
        rel = str(pth.relative_to(dr))
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO lite.patient_documents (patient_id, category, filename, storage_path, mime_type, metadata)
                VALUES ($1,$2,$3,$4,$5,'{}'::jsonb) RETURNING *
                """,
                o, document_class, name, rel, file.content_type,
            )
            await conn.execute("UPDATE lite.patients SET updated_at = NOW() WHERE id = $1", o)
            await log_audit(
                conn, o, "intake_upload",
                {"document_class": document_class, "filename": name, "id": str(row["id"])},
            )
        return {"order_id": str(o), "document": _r_upload(row)}

    class OrderCreateBody(BaseModel):
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

    class OrderPatchBody(BaseModel):
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
        product_description: Optional[str] = None
        order_date_iso: Optional[str] = None
        dos_iso: Optional[str] = None
        delivery_date: Optional[date] = None
        delivery_address: Optional[str] = None
        pod_recipient_name: Optional[str] = None
        pod_recipient_email: Optional[str] = None
        docusign_envelope_id: Optional[str] = None
        final_packet_path: Optional[str] = None
        coding_cover_sheet_status: Optional[str] = None
        pod_status: Optional[str] = None
        final_packet_status: Optional[str] = None
        tebra_record_status: Optional[str] = None

    async def get_order(oid: uuid.UUID, pool: asyncpg.Pool) -> dict[str, Any]:
        async with pool.acquire() as conn:
            pr = await conn.fetchrow("SELECT * FROM lite.patients WHERE id = $1", oid)
            if not pr:
                raise HTTPException(404, "order not found")
            wr = await _ensure_workflow_row(conn, oid)
        return {
            "id": str(oid),
            "patient": _row_patient_dict(pr),
            "workflow": row_workflow(wr),
        }

    @r.post("/orders")
    async def create_order(body: OrderCreateBody, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        async with pool.acquire() as conn:
            pr = await conn.fetchrow(
                """
                INSERT INTO lite.patients (first_name, last_name, dob, phone, email, address, payer_name, member_id, ordering_provider,
                diagnosis_codes, hcpcs_codes, notes) VALUES
                ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12) RETURNING *
                """,
                body.first_name, body.last_name, body.dob, body.phone, body.email, body.address, body.payer_name,
                body.member_id, body.ordering_provider, json.dumps(body.diagnosis_codes), json.dumps(body.hcpcs_codes), body.notes,
            )
            await _ensure_workflow_row(conn, pr["id"])
            await log_audit(conn, pr["id"], "order_create", {"api": "v1"})
        return await get_order(pr["id"], pool)

    async def _queue_impl(pool: asyncpg.Pool, b: Optional[str]) -> dict[str, Any]:
        if b and b not in ("green", "yellow", "red"):
            raise HTTPException(400, "bucket must be green, yellow, or red")
        out: list[dict[str, Any]] = []
        async with pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM lite.patients ORDER BY updated_at DESC LIMIT 500")
        for pr in rows:
            oid = pr["id"]
            pdict = _row_patient_dict(pr)
            async with pool.acquire() as conn:
                wrow = await _ensure_workflow_row(conn, uuid.UUID(str(oid)))
                wdict = row_workflow(wrow)
                ucats = {c["category"] for c in await conn.fetch("SELECT category FROM lite.patient_documents WHERE patient_id = $1", oid)}
                gts = {c["document_type"] for c in await conn.fetch("SELECT document_type FROM lite.generated_documents WHERE patient_id = $1", oid)}
            has_c = "coding_cover_sheet" in gts
            hits = build_rule_hits(pdict, ucats, has_c)
            qb = infer_queue_bucket(hits, wdict)
            if b and qb != b:
                continue
            out.append({"id": str(oid), "queue_bucket": qb, "patient": pdict, "workflow": wdict})
        return {"orders": out}

    @r.get("/orders")
    async def list_all_orders(
        pool: asyncpg.Pool = Depends(get_pool),
    ) -> dict[str, Any]:
        return await _queue_impl(pool, None)

    @r.get("/orders/queue")
    async def order_queue(
        bucket: Optional[str] = Query(None, description="green, yellow, red"),
        pool: asyncpg.Pool = Depends(get_pool),
    ) -> dict[str, Any]:
        bq = (bucket and bucket.lower()) or None
        if bq and bq not in ("green", "yellow", "red"):
            raise HTTPException(400, "bucket must be green, yellow, or red")
        return await _queue_impl(pool, bq)

    @r.get("/orders/{order_id}")
    async def get_order_h(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        return await get_order(order_id, pool)

    @r.patch("/orders/{order_id}")
    async def patch_order(
        order_id: uuid.UUID,
        body: OrderPatchBody,
        pool: asyncpg.Pool = Depends(get_pool),
    ) -> dict[str, Any]:
        raw = body.model_dump(exclude_unset=True)
        wf_f = {
            "product_description", "order_date_iso", "dos_iso", "delivery_date", "delivery_address",
            "pod_recipient_name", "pod_recipient_email", "docusign_envelope_id", "final_packet_path",
            "coding_cover_sheet_status", "pod_status", "final_packet_status", "tebra_record_status",
        }
        p_raw = {k: v for k, v in raw.items() if k not in wf_f}
        w_raw = {k: v for k, v in raw.items() if k in wf_f}
        _validate_enum(w_raw.get("coding_cover_sheet_status"), trident30.CODING_COVER_SHEET_STATUS, "coding_cover_sheet_status")
        _validate_enum(w_raw.get("pod_status"), trident30.POD_STATUS, "pod_status")
        _validate_enum(w_raw.get("final_packet_status"), trident30.FINAL_PACKET_STATUS, "final_packet_status")
        _validate_enum(w_raw.get("tebra_record_status"), trident30.TEBRA_RECORD_STATUS, "tebra_record_status")
        async with pool.acquire() as conn:
            e = await conn.fetchval("SELECT 1 FROM lite.patients WHERE id = $1", order_id)
            if not e:
                raise HTTPException(404, "order not found")
            await _ensure_workflow_row(conn, order_id)
            if p_raw:
                sets, args, i = [], [], 1
                for k, v in p_raw.items():
                    if k in ("diagnosis_codes", "hcpcs_codes"):
                        sets.append(f"{k} = ${i}::jsonb")
                        args.append(json.dumps(v if v is not None else []))
                    else:
                        sets.append(f"{k} = ${i}")
                        args.append(v)
                    i += 1
                sets.append("updated_at = NOW()")
                args.append(order_id)
                sql = f"UPDATE lite.patients SET {', '.join(sets)} WHERE id = ${i}"
                await conn.execute(sql, *args)
            if w_raw:
                sets, args, i = [], [order_id], 2
                for k, v in w_raw.items():
                    sets.append(f"{k} = ${i}")
                    args.append(v)
                    i += 1
                sets.append("updated_at = NOW()")
                await conn.execute(
                    f"UPDATE lite.order_workflow SET {', '.join(sets)} WHERE order_id = $1", *args
                )
            await log_audit(conn, order_id, "order_patch", {**raw, "at": datetime.now(timezone.utc).isoformat()})
        return await get_order(order_id, pool)

    async def _load_lists(
        pool: asyncpg.Pool, oid: uuid.UUID
    ) -> tuple[dict, list[dict], list[dict], asyncpg.Record]:
        async with pool.acquire() as conn:
            p = await conn.fetchrow("SELECT * FROM lite.patients WHERE id = $1", oid)
            if not p:
                raise HTTPException(404, "order not found")
            w = await _ensure_workflow_row(conn, oid)
            ups = [ _r_upload(x) for x in await conn.fetch("SELECT * FROM lite.patient_documents WHERE patient_id = $1", oid) ]
            gens = [ _r_gen(x) for x in await conn.fetch("SELECT * FROM lite.generated_documents WHERE patient_id = $1", oid) ]
        return _row_patient_dict(p), ups, gens, w

    @r.post("/orders/{order_id}/evaluate")
    async def eval_order(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        p, ups, gen, w = await _load_lists(pool, order_id)
        uc = {u["category"] for u in ups}
        gtypes = {g["document_type"] for g in gen}
        has_c = "coding_cover_sheet" in gtypes
        hits = build_rule_hits(p, uc, has_c)
        qb = infer_queue_bucket(hits, row_workflow(w))
        return {"order_id": str(order_id), "queue_bucket": qb, "rule_hits": hits}

    @r.get("/orders/{order_id}/readiness")
    async def readiness_order(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        p, ups, gen, _w = await _load_lists(pool, order_id)
        gtypes = {g["document_type"] for g in gen}
        return {
            "order_id": str(order_id),
            "readiness": build_readiness(p, [dict(**u) for u in ups], gtypes),
        }

    @r.post("/orders/{order_id}/generate-coding-cover-sheet")
    async def gen_cover(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        p, ups, gen, w = await _load_lists(pool, order_id)
        at = datetime.now(timezone.utc)
        wf_d = row_workflow(w)
        text = trident30.generate_coding_cover_sheet_content(
            p, ups, gen, at, wf=wf_d,
        )
        dest = dr / str(order_id) / "generated" / f"coding_cover_{at.strftime('%Y%m%d_%H%M%S')}.txt"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
        rel = str(dest.relative_to(dr))
        async with pool.acquire() as conn:
            g = await conn.fetchrow(
                """
                INSERT INTO lite.generated_documents (patient_id, document_type, content, file_path, metadata)
                VALUES ($1, 'coding_cover_sheet', $2, $3, $4::jsonb) RETURNING *
                """,
                order_id, text, rel, json.dumps({"trident": "3.0", "generated_at": at.isoformat()}),
            )
            await conn.execute(
                "UPDATE lite.order_workflow SET coding_cover_sheet_status = 'generated', updated_at = NOW() WHERE order_id = $1",
                order_id,
            )
            await log_audit(conn, order_id, "generate_coding_cover_sheet", {"generated_id": str(g["id"])})
        return {"order_id": str(order_id), "document": _r_gen(g)}

    @r.get("/orders/{order_id}/coding-cover-sheet")
    async def get_cover_order(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        async with pool.acquire() as conn:
            g = await conn.fetchrow(
                """
                SELECT * FROM lite.generated_documents
                WHERE patient_id = $1 AND document_type = 'coding_cover_sheet' ORDER BY created_at DESC LIMIT 1
                """,
                order_id,
            )
        if not g:
            raise HTTPException(404, "no coding cover sheet")
        return {"order_id": str(order_id), "document": _r_gen(g)}

    @r.post("/orders/{order_id}/generate-pod-packet")
    async def gen_pod_order(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        p, _u, _g, w = await _load_lists(pool, order_id)
        at = datetime.now(timezone.utc)
        wf = row_workflow(w)
        text = trident30.generate_pod_packet_content(p, wf, at)
        dest = dr / str(order_id) / "generated" / f"pod_packet_{at.strftime('%Y%m%d_%H%M%S')}.txt"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
        rel = str(dest.relative_to(dr))
        async with pool.acquire() as conn:
            g = await conn.fetchrow(
                """
                INSERT INTO lite.generated_documents (patient_id, document_type, content, file_path, metadata)
                VALUES ($1, 'pod_packet', $2, $3, $4::jsonb) RETURNING *
                """,
                order_id, text, rel, json.dumps({"trident": "3.0", "generated_at": at.isoformat()}),
            )
            st = (await conn.fetchrow("SELECT pod_status FROM lite.order_workflow WHERE order_id = $1", order_id))["pod_status"]
            if st == "not_required":
                await conn.execute("UPDATE lite.order_workflow SET pod_status = 'pending_send', updated_at = NOW() WHERE order_id = $1", order_id)
            await log_audit(conn, order_id, "generate_pod_packet", {"id": str(g["id"])})
        return {"order_id": str(order_id), "document": _r_gen(g)}

    @r.post("/orders/{order_id}/send-pod-docusign")
    async def send_pod(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        """Stub: no external DocuSign; creates envelope id and docusign_events row."""
        async with pool.acquire() as conn:
            pr = await conn.fetchrow("SELECT * FROM lite.patients WHERE id = $1", order_id)
            if not pr:
                raise HTTPException(404, "order not found")
            await _ensure_workflow_row(conn, order_id)
            w = await conn.fetchrow("SELECT * FROM lite.order_workflow WHERE order_id = $1", order_id)
            en = w.get("docusign_envelope_id") or f"stub_env_{order_id.hex[:8]}_{uuid.uuid4().hex[:8]}"
            await conn.execute("UPDATE lite.order_workflow SET docusign_envelope_id = $2, pod_status = 'sent', updated_at = NOW() WHERE order_id = $1", order_id, en)
            rname = f"{pr.get('first_name', '')} {pr.get('last_name', '')}".strip() or "Patient"
            rmail = (pr.get("email") or "").strip() or f"dev+{order_id.hex[:8]}@example.invalid"
            ev = await conn.fetchrow(
                """
                INSERT INTO lite.docusign_events (order_id, envelope_id, template_name, recipient_name, recipient_email, status, sent_at, updated_at)
                VALUES ($1, $2, 'proof_of_delivery', $3, $4, 'sent', NOW(), NOW()) RETURNING *
                """,
                order_id, en, rname, rmail,
            )
            await log_audit(conn, order_id, "send_pod_docusign", {"envelope_id": en, "event_id": str(ev["id"])})
        return {
            "order_id": str(order_id),
            "docusign_envelope_id": en,
            "event": {
                "id": str(ev["id"]),
                "envelope_id": en,
                "status": "sent",
                "recipient_email": rmail,
            },
        }

    @r.get("/orders/{order_id}/pod-status")
    async def pod_status_h(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        async with pool.acquire() as conn:
            w = await conn.fetchrow("SELECT * FROM lite.order_workflow WHERE order_id = $1", order_id)
            if not w:
                return {"order_id": str(order_id), "error": "no workflow"}
        evs = None
        async with pool.acquire() as conn:
            evs = await conn.fetch("SELECT * FROM lite.docusign_events WHERE order_id = $1 ORDER BY created_at DESC", order_id)
        return {
            "order_id": str(order_id),
            "pod_status": w["pod_status"],
            "docusign_envelope_id": w.get("docusign_envelope_id"),
            "events": [
                {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in dict(e).items()}
                for e in (evs or [])
            ],
        }

    @r.post("/orders/{order_id}/ingest-signed-pod")
    async def ingest_signed_pod(
        order_id: uuid.UUID, file: UploadFile = File(...), pool: asyncpg.Pool = Depends(get_pool),
    ) -> dict[str, Any]:
        p, _a, _b, _c = await _load_lists(pool, order_id)
        _ = p
        name = _sn(file.filename or "signed_pod.pdf")
        pdir = dr / str(order_id) / "uploads"
        pdir.mkdir(parents=True, exist_ok=True)
        uid = uuid.uuid4()
        pth = pdir / f"{uid}_{name}"
        pth.write_bytes(await file.read())
        rel = str(pth.relative_to(dr))
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO lite.patient_documents (patient_id, category, filename, storage_path, mime_type, metadata)
                VALUES ($1, 'proof_of_delivery_signed', $2, $3, $4, $5::jsonb) RETURNING *
                """,
                order_id, name, rel, file.content_type, json.dumps({"ingested": datetime.now(timezone.utc).isoformat()}),
            )
            await conn.execute("UPDATE lite.order_workflow SET pod_status = 'completed', updated_at = NOW() WHERE order_id = $1", order_id)
            await conn.execute(
                """
                UPDATE lite.docusign_events
                SET status = 'completed', completed_at = NOW(), signed_document_path = $2, updated_at = NOW()
                WHERE order_id = $1
                """,
                order_id, rel,
            )
            await log_audit(conn, order_id, "ingest_signed_pod", {"document_id": str(row["id"])})
        return {"order_id": str(order_id), "document": _r_upload(row)}

    @r.post("/orders/{order_id}/generate-final-packet")
    async def gen_final_order(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        p, ups, gen, w = await _load_lists(pool, order_id)
        uc = {u["category"] for u in ups}
        has_spod = "proof_of_delivery_signed" in uc or "pod" in uc
        at = datetime.now(timezone.utc)
        wf = row_workflow(w)
        text = trident30.generate_final_packet_content(
            p, [dict(u) for u in ups], [dict(g) for g in gen], wf, at, has_spod,
        )
        dest = dr / str(order_id) / "generated" / f"final_packet_{at.strftime('%Y%m%d_%H%M%S')}.txt"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
        rel = str(dest.relative_to(dr))
        async with pool.acquire() as conn:
            g = await conn.fetchrow(
                """
                INSERT INTO lite.generated_documents (patient_id, document_type, content, file_path, metadata)
                VALUES ($1, 'final_packet', $2, $3, $4::jsonb) RETURNING *
                """,
                order_id, text, rel, json.dumps({}),
            )
            await conn.execute(
                "UPDATE lite.order_workflow SET final_packet_status = 'assembled', final_packet_path = $2, updated_at = NOW() WHERE order_id = $1",
                order_id, rel,
            )
            await log_audit(conn, order_id, "generate_final_packet", {"id": str(g["id"])})
        return {"order_id": str(order_id), "document": _r_gen(g)}

    @r.get("/orders/{order_id}/final-packet")
    async def get_final_p(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        async with pool.acquire() as conn:
            g = await conn.fetchrow(
                "SELECT * FROM lite.generated_documents WHERE patient_id = $1 AND document_type = 'final_packet' ORDER BY created_at DESC LIMIT 1",
                order_id,
            )
        if not g:
            raise HTTPException(404, "no final packet")
        return {"order_id": str(order_id), "document": _r_gen(g)}

    @r.post("/orders/{order_id}/mark-saved-to-tebra")
    async def mark_tebra(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        async with pool.acquire() as conn:
            e = await conn.fetchval("SELECT 1 FROM lite.patients WHERE id = $1", order_id)
            if not e:
                raise HTTPException(404, "order not found")
            w = await _ensure_workflow_row(conn, order_id)
            await conn.execute(
                "UPDATE lite.order_workflow SET tebra_record_status = 'saved', final_packet_status = 'saved_to_tebra', updated_at = NOW() WHERE order_id = $1",
                order_id,
            )
            h = await conn.fetchrow(
                "INSERT INTO lite.tebra_handoff (order_id, action, details) VALUES ($1, 'saved', $2::jsonb) RETURNING *",
                order_id, json.dumps({"at": datetime.now(timezone.utc).isoformat(), "final_packet": w.get("final_packet_path")}),
            )
            await log_audit(conn, order_id, "mark_saved_to_tebra", {"handoff_id": str(h["id"])})
        return await get_order(order_id, pool)

    @r.get("/orders/{order_id}/handoff-history")
    async def handoff(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        async with pool.acquire() as conn:
            ex = await conn.fetchval("SELECT 1 FROM lite.patients WHERE id = $1", order_id)
            if not ex:
                raise HTTPException(404, "order not found")
            h = await conn.fetch(
                "SELECT * FROM lite.tebra_handoff WHERE order_id = $1 ORDER BY created_at DESC", order_id
            )
        return {
            "order_id": str(order_id),
            "rows": [dict(x) for x in h],
        }

    @r.get("/orders/{order_id}/events")
    async def order_events(order_id: uuid.UUID, pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
        """Audit log for order (and include docusign)."""
        async with pool.acquire() as conn:
            a = await conn.fetch(
                "SELECT id, order_id, action, details, created_at FROM lite.trident_audit_log WHERE order_id = $1 ORDER BY created_at DESC", order_id
            )
        return {
            "order_id": str(order_id),
            "audit": [dict(x) for x in a],
        }

    return r
