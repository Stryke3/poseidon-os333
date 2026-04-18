"""
POSEIDON EDI Service — 835 Inbound Remittance Routes

Endpoints:
  POST /api/v1/remittance/upload          — Upload 835 EDI file or PDF EOB
  POST /api/v1/remittance/poll-stedi-835  — Fetch Stedi 835 reports, persist (idempotent)
  POST /api/v1/remittance/parse-raw       — Parse raw X12 835 string
  GET  /api/v1/remittance/batches         — List remittance batches
  GET  /api/v1/remittance/batch/{id}      — Get batch detail with claims
  POST /api/v1/remittance/batch/{id}/post — Auto-post payments to orders
  GET  /api/v1/remittance/denials         — Denial worklist from remittance
  GET  /api/v1/remittance/stats           — Remittance KPIs
"""
from __future__ import annotations

import io
import json
import logging
import uuid as _uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel

from app.clients.stedi import stedi_client
from app.database import get_db, get_db_transaction, audit_log, to_json
from app.deps import require_edi_caller
from app.parsers.era_835 import parse_835_x12, classify_carc

log = logging.getLogger("edi.routes.remittance")
router = APIRouter(
    prefix="/api/v1/remittance",
    tags=["835 Remittance"],
    dependencies=[Depends(require_edi_caller)],
)


async def _existing_batch_by_icn(conn, org_uuid: _uuid.UUID, icn: Optional[str]):
    if not icn or not str(icn).strip():
        return None
    row = await conn.fetchrow(
        """
        SELECT id FROM remittance_batches
        WHERE org_id = $1 AND interchange_control_num = $2
        LIMIT 1
        """,
        org_uuid,
        str(icn).strip(),
    )
    return row["id"] if row else None


async def persist_parsed_835_in_transaction(
    conn,
    org_uuid: _uuid.UUID,
    filename: str,
    source: str,
    content_str: str,
    parsed: dict,
    *,
    skip_duplicate_icn: bool = True,
    stedi_transaction_id: Optional[str] = None,
) -> dict:
    """
    Insert remittance_batches + claims + adjustments + service lines (same as upload).
    If skip_duplicate_icn and interchange_control_num already exists for org, returns duplicate.
    """
    header = parsed.get("header", {})
    claims = parsed.get("claims", [])
    if not claims:
        return {"status": "no_claims", "message": "No claims found in 835"}

    icn = header.get("interchange_control_num")
    if skip_duplicate_icn and icn:
        existing = await _existing_batch_by_icn(conn, org_uuid, icn)
        if existing:
            return {
                "status": "duplicate",
                "batch_id": str(existing),
                "interchange_control_num": icn,
                "filename": filename,
            }

    batch_id = await conn.fetchval(
        """
        INSERT INTO remittance_batches
            (org_id, filename, source, file_format, raw_x12_inbound,
             interchange_control_num, payer_name, payer_id_code,
             check_number, check_date, total_paid,
             status, claim_count, parsed_at)
        VALUES ($1, $2, $3, '835', $4, $5, $6, $7, $8, $9::DATE, $10,
                'parsed', $11, NOW())
        RETURNING id
        """,
        org_uuid,
        filename,
        source,
        content_str,
        icn,
        header.get("payer_name"),
        header.get("payer_id_code"),
        header.get("check_number"),
        header.get("check_date"),
        float(header.get("total_paid", 0)),
        len(claims),
    )

    denial_count = 0
    for claim in claims:
        pcn = claim.get("patient_control_number", "")
        resolved_order_id = await _resolve_order_uuid(pcn, conn)

        submission_id = None
        if resolved_order_id:
            submission_id = await conn.fetchval(
                "SELECT id FROM claim_submissions WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1",
                resolved_order_id,
            )

        rc_id = await conn.fetchval(
            """
            INSERT INTO remittance_claims
                (batch_id, org_id, patient_control_number, order_id,
                 claim_submission_id, payer_claim_number,
                 claim_status_code, billed_amount, paid_amount,
                 patient_responsibility, filing_indicator,
                 patient_last_name, patient_first_name, patient_member_id,
                 rendering_npi, service_date_start, service_date_end,
                 is_denial, is_partial_pay, is_reversal)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::DATE,$17::DATE,$18,$19,$20)
            RETURNING id
            """,
            batch_id,
            org_uuid,
            pcn,
            resolved_order_id,
            submission_id,
            claim.get("payer_claim_number"),
            claim.get("claim_status_code"),
            float(claim.get("billed_amount", 0)),
            float(claim.get("paid_amount", 0)),
            float(claim.get("patient_responsibility", 0)),
            claim.get("filing_indicator"),
            claim.get("patient", {}).get("last_name"),
            claim.get("patient", {}).get("first_name"),
            claim.get("patient", {}).get("member_id"),
            claim.get("provider_npi"),
            claim.get("service_date_start"),
            claim.get("service_date_end"),
            claim.get("is_denial", False),
            claim.get("is_partial_pay", False),
            claim.get("is_reversal", False),
        )

        if claim.get("is_denial"):
            denial_count += 1

        for adj in claim.get("adjustments", []):
            await conn.execute(
                """
                INSERT INTO remittance_adjustments
                    (remittance_claim_id, adjustment_group, carc_code,
                     rarc_code, adjustment_amount, adjustment_quantity,
                     denial_category, is_actionable, suggested_action)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                """,
                rc_id,
                adj.get("adjustment_group"),
                adj.get("carc_code"),
                adj.get("rarc_code"),
                float(adj.get("adjustment_amount", 0)),
                adj.get("adjustment_quantity"),
                adj.get("denial_category"),
                adj.get("is_actionable", True),
                adj.get("suggested_action"),
            )

        for svc in claim.get("service_lines", []):
            await conn.execute(
                """
                INSERT INTO remittance_service_lines
                    (remittance_claim_id, hcpcs_code, modifier,
                     billed_amount, paid_amount, allowed_amount,
                     deductible, coinsurance, copay,
                     units_billed, units_paid)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                """,
                rc_id,
                svc.get("hcpcs_code"),
                svc.get("modifier"),
                float(svc.get("billed_amount", 0)),
                float(svc.get("paid_amount", 0)),
                float(svc.get("allowed_amount", 0)) if svc.get("allowed_amount") else None,
                float(svc.get("deductible", 0)) if svc.get("deductible") else None,
                float(svc.get("coinsurance", 0)) if svc.get("coinsurance") else None,
                float(svc.get("copay", 0)) if svc.get("copay") else None,
                svc.get("units_billed"),
                svc.get("units_paid"),
            )

        if resolved_order_id:
            new_status = (
                "denied"
                if claim.get("is_denial")
                else "paid"
                if float(claim.get("paid_amount", 0)) > 0
                else "adjudicated"
            )
            await conn.execute(
                "UPDATE orders SET claim_status=$2, updated_at=NOW() WHERE id=$1",
                resolved_order_id,
                new_status,
            )

    await audit_log(
        conn,
        "remittance_batch",
        batch_id,
        "parsed",
        new_status="parsed",
        details={
            "claims": len(claims),
            "denials": denial_count,
            "filename": filename,
            "source": source,
        },
    )

    if stedi_transaction_id and str(stedi_transaction_id).strip():
        await conn.execute(
            """
            INSERT INTO stedi_835_import_ids (stedi_transaction_id, batch_id)
            VALUES ($1, $2)
            ON CONFLICT (stedi_transaction_id) DO NOTHING
            """,
            str(stedi_transaction_id).strip(),
            batch_id,
        )

    return {
        "status": "parsed",
        "batch_id": str(batch_id),
        "denial_count": denial_count,
        "summary": parsed.get("summary", {}),
        "payer": header.get("payer_name"),
        "check_number": header.get("check_number"),
    }


async def persist_835_x12_string(
    org_uuid: _uuid.UUID,
    filename: str,
    source: str,
    content_str: str,
    *,
    stedi_transaction_id: Optional[str] = None,
) -> dict:
    """
    Parse X12 835 and persist in one transaction. Used by SFTP poll and Stedi import.
    """
    content_str = content_str or ""
    is_835 = (
        content_str.strip().startswith("ISA")
        or "~CLP*" in content_str
        or "*HP*" in content_str
    )
    if not is_835:
        return {"status": "not_835", "filename": filename, "message": "Content is not 835 X12"}

    parsed = parse_835_x12(content_str)
    async with get_db_transaction() as conn:
        result = await persist_parsed_835_in_transaction(
            conn,
            org_uuid,
            filename,
            source,
            content_str,
            parsed,
            stedi_transaction_id=stedi_transaction_id,
        )
    if result.get("status") == "parsed" and result.get("denial_count", 0) > 0:
        log.info(
            "Batch %s: %s denials queued for Trident training",
            result.get("batch_id"),
            result["denial_count"],
        )
    return result


# ─── UPLOAD & PARSE 835 FILE ────────────────────────────────────────────────

@router.post("/upload")
async def upload_remittance(
    file: UploadFile = File(...),
    org_id: str = Form(...),
    source: str = Form("manual_upload"),
):
    """
    Upload an 835 EDI file. Parses, stores claims/adjustments, and
    tees up denials for the worklist + Trident training pipeline.
    """
    org_uuid = _uuid.UUID(org_id)
    content = await file.read()
    content_str = content.decode("utf-8", errors="replace")

    # Detect file type
    is_835 = content_str.strip().startswith("ISA") or "~CLP*" in content_str or "*HP*" in content_str
    if not is_835:
        raise HTTPException(
            400,
            "File does not appear to be an 835 EDI transaction. "
            "Expected X12 format starting with ISA segment.",
        )

    # Parse
    parsed = parse_835_x12(content_str)

    if not parsed.get("claims"):
        raise HTTPException(400, "No claims found in 835 file")

    async with get_db_transaction() as conn:
        out = await persist_parsed_835_in_transaction(
            conn,
            org_uuid,
            file.filename or "upload.edi",
            source,
            content_str,
            parsed,
        )

    if out.get("status") == "duplicate":
        return {
            "batch_id": out["batch_id"],
            "filename": file.filename,
            "status": "duplicate",
            "message": "Interchange control number already imported for this org",
        }

    if out.get("status") != "parsed":
        raise HTTPException(400, out.get("message", "Persist failed"))

    denial_count = out.get("denial_count", 0)
    if denial_count > 0:
        log.info(f"Batch {out['batch_id']}: {denial_count} denials queued for Trident training")

    return {
        "batch_id": out["batch_id"],
        "filename": file.filename,
        "status": "parsed",
        "summary": out.get("summary", {}),
        "payer": out.get("payer"),
        "check_number": out.get("check_number"),
        "denials_found": denial_count,
    }


# ─── PARSE RAW X12 STRING ───────────────────────────────────────────────────

@router.post("/parse-raw")
async def parse_raw_835(content: str = Form(...)):
    """Parse raw X12 835 string without storing. For testing/preview."""
    parsed = parse_835_x12(content)
    return parsed


def _extract_x12_from_stedi_835_report(rep: dict) -> Optional[str]:
    """Best-effort: Stedi 835 report JSON may nest raw X12 under several keys."""
    if not rep or not isinstance(rep, dict):
        return None
    for key in ("x12", "rawX12", "raw_x12", "edi", "payload", "data"):
        v = rep.get(key)
        if isinstance(v, str) and v.strip().startswith("ISA"):
            return v
    nested_keys = ("report", "remittance", "835", "era", "output", "transaction")
    for nk in nested_keys:
        sub = rep.get(nk)
        if isinstance(sub, dict):
            found = _extract_x12_from_stedi_835_report(sub)
            if found:
                return found
        if isinstance(sub, str) and sub.strip().startswith("ISA"):
            return sub
    return None


@router.post("/poll-stedi-835")
async def poll_stedi_835_remittance(
    org_id: str = Query(..., description="Organization UUID stored on remittance_batches"),
    max_submissions: int = Query(50, ge=1, le=200),
    also_poll_transactions: bool = Query(
        False,
        description="If true, also call Stedi /polling/transactions once (optional cursor)",
    ),
    poll_cursor: Optional[str] = Query(None, alias="cursor"),
):
    """
    Pull 835 ERAs from Stedi for claim submissions we originated (stedi_api), persist like /upload.
    Idempotent per Stedi transaction id (stedi_835_import_ids).

    Schedule via cron / Kubernetes CronJob / your scheduler, e.g. every 15–30 minutes:
      POST /api/v1/remittance/poll-stedi-835?org_id=<uuid>&max_submissions=50
    """
    org_uuid = _uuid.UUID(org_id)
    results: list[dict] = []
    next_cursor: Optional[str] = None

    async with get_db() as conn:
        rows = await conn.fetch(
            """
            SELECT t.tid
            FROM (
                SELECT cs.stedi_transaction_id AS tid, MAX(cs.submitted_at) AS mx
                FROM claim_submissions cs
                WHERE cs.stedi_transaction_id IS NOT NULL
                  AND TRIM(cs.stedi_transaction_id) <> ''
                  AND cs.submission_method = 'stedi_api'
                  AND cs.submitted_at > NOW() - INTERVAL '400 days'
                  AND NOT EXISTS (
                      SELECT 1 FROM stedi_835_import_ids s
                      WHERE s.stedi_transaction_id = cs.stedi_transaction_id
                  )
                GROUP BY cs.stedi_transaction_id
            ) t
            ORDER BY t.mx DESC
            LIMIT $1
            """,
            max_submissions,
        )
        pending_tids = [r["tid"] for r in rows]

    for tid in pending_tids:
        entry: dict = {"stedi_transaction_id": tid, "status": "skipped"}
        try:
            rep = await stedi_client.get_835_report(str(tid))
            if not rep:
                entry["status"] = "no_report_yet"
                results.append(entry)
                continue
            raw = _extract_x12_from_stedi_835_report(rep)
            if not raw:
                entry["status"] = "no_x12_in_report"
                entry["keys"] = list(rep.keys())[:20]
                results.append(entry)
                continue
            out = await persist_835_x12_string(
                org_uuid,
                f"stedi-{tid}.835",
                "stedi_api_poll",
                raw,
                stedi_transaction_id=str(tid),
            )
            entry.update(out)
            results.append(entry)
        except Exception as e:
            log.warning("Stedi 835 poll failed for %s: %s", tid, e)
            entry["status"] = "error"
            entry["error"] = str(e)[:300]
            results.append(entry)

    if also_poll_transactions:
        try:
            polled = await stedi_client.poll_transactions(poll_cursor)
        except Exception as e:
            results.append({"poll_transactions": "error", "error": str(e)[:300]})
            polled = None
        if polled and isinstance(polled, dict):
            next_cursor = polled.get("nextCursor") or polled.get("next_cursor")
            txs = (
                polled.get("transactions")
                or polled.get("items")
                or polled.get("data")
                or []
            )
            if isinstance(txs, dict):
                txs = list(txs.values()) if txs else []
            cap = min(25, max_submissions)
            for tx in txs[:cap]:
                if not isinstance(tx, dict):
                    continue
                tx_id = (
                    tx.get("transactionId")
                    or tx.get("transaction_id")
                    or tx.get("id")
                )
                if not tx_id:
                    continue
                try:
                    async with get_db() as conn:
                        exists = await conn.fetchval(
                            "SELECT 1 FROM stedi_835_import_ids WHERE stedi_transaction_id=$1",
                            str(tx_id),
                        )
                    if exists:
                        continue
                    rep = await stedi_client.get_835_report(str(tx_id))
                    if not rep:
                        continue
                    raw = _extract_x12_from_stedi_835_report(rep)
                    if not raw:
                        continue
                    out = await persist_835_x12_string(
                        org_uuid,
                        f"stedi-poll-{tx_id}.835",
                        "stedi_transactions_poll",
                        raw,
                        stedi_transaction_id=str(tx_id),
                    )
                    results.append({"stedi_transaction_id": tx_id, **out, "via": "poll_transactions"})
                except Exception as e:
                    results.append(
                        {
                            "stedi_transaction_id": tx_id,
                            "via": "poll_transactions",
                            "status": "error",
                            "error": str(e)[:300],
                        }
                    )

    return {
        "org_id": org_id,
        "submission_sweep_count": len(pending_tids),
        "results": results,
        "next_poll_cursor": next_cursor,
    }


# ─── AUTO-POST PAYMENTS ─────────────────────────────────────────────────────

@router.post("/batch/{batch_id}/post")
async def auto_post_batch(batch_id: str):
    """
    Auto-post payments from a parsed remittance batch.
    Creates/updates payment records, updates order statuses.
    Feeds paid amounts into Trident learned rates.
    """
    bid = _uuid.UUID(batch_id)
    async with get_db_transaction() as conn:
        batch = await conn.fetchrow(
            "SELECT * FROM remittance_batches WHERE id=$1", bid
        )
        if not batch:
            raise HTTPException(404, "Batch not found")

        claims = await conn.fetch(
            "SELECT * FROM remittance_claims WHERE batch_id=$1 AND auto_posted=FALSE", bid
        )

        posted = 0
        skipped = 0
        errors = []

        for claim in claims:
            order_id = claim["order_id"]
            if not order_id:
                skipped += 1
                continue

            try:
                paid = float(claim["paid_amount"] or 0)

                # Insert into payment_outcomes for Trident training
                await conn.execute("""
                    INSERT INTO payment_outcomes
                        (claim_number, payment_status, paid_amount,
                         payer_name, service_date,
                         source, created_at)
                    VALUES ($1, $2, $3, $4, $5::DATE, 'era_835', NOW())
                """,
                    claim["patient_control_number"],
                    "denied" if claim["is_denial"] else "paid",
                    paid,
                    batch["payer_name"],
                    claim["service_date_start"],
                )

                # Update order
                await conn.execute("""
                    UPDATE orders
                    SET claim_status=$2, paid_amount=COALESCE(paid_amount,0)+$3, updated_at=NOW()
                    WHERE id=$1
                """, order_id,
                    "denied" if claim["is_denial"] else "paid",
                    paid,
                )

                # Mark as posted
                await conn.execute(
                    "UPDATE remittance_claims SET auto_posted=TRUE WHERE id=$1",
                    claim["id"],
                )
                posted += 1

            except Exception as e:
                errors.append({"claim_id": str(claim["id"]), "error": str(e)[:200]})

        await conn.execute(
            "UPDATE remittance_batches SET status='posted', posted_at=NOW() WHERE id=$1",
            bid,
        )

        await audit_log(conn, "remittance_batch", bid, "auto_posted",
                        old_status="parsed", new_status="posted",
                        details={"posted": posted, "skipped": skipped, "errors": len(errors)})

    return {
        "batch_id": batch_id,
        "posted": posted,
        "skipped": skipped,
        "errors": errors,
    }


# ─── LIST BATCHES ───────────────────────────────────────────────────────────

@router.get("/batches")
async def list_batches(
    org_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List remittance batches with filters."""
    conditions = []
    params = []
    idx = 1

    if org_id:
        conditions.append(f"org_id=${idx}")
        params.append(_uuid.UUID(org_id))
        idx += 1
    if status:
        conditions.append(f"status=${idx}")
        params.append(status)
        idx += 1

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    async with get_db() as conn:
        total = await conn.fetchval(f"SELECT COUNT(*) FROM remittance_batches {where}", *params)
        params.extend([limit, offset])
        rows = await conn.fetch(f"""
            SELECT id, org_id, filename, source, payer_name, check_number, check_date,
                   total_paid, status, claim_count, received_at, parsed_at, posted_at
            FROM remittance_batches {where}
            ORDER BY created_at DESC LIMIT ${idx} OFFSET ${idx+1}
        """, *params)

        return {"total": total, "batches": [dict(r) for r in rows]}


# ─── BATCH DETAIL ───────────────────────────────────────────────────────────

@router.get("/batch/{batch_id}")
async def get_batch_detail(batch_id: str):
    """Get full batch detail including all claims, adjustments, service lines."""
    bid = _uuid.UUID(batch_id)
    async with get_db() as conn:
        batch = await conn.fetchrow("SELECT * FROM remittance_batches WHERE id=$1", bid)
        if not batch:
            raise HTTPException(404, "Batch not found")

        claims = await conn.fetch(
            "SELECT * FROM remittance_claims WHERE batch_id=$1 ORDER BY created_at", bid
        )

        claim_data = []
        for c in claims:
            adjustments = await conn.fetch(
                "SELECT * FROM remittance_adjustments WHERE remittance_claim_id=$1", c["id"]
            )
            svc_lines = await conn.fetch(
                "SELECT * FROM remittance_service_lines WHERE remittance_claim_id=$1", c["id"]
            )
            claim_data.append({
                **dict(c),
                "adjustments": [dict(a) for a in adjustments],
                "service_lines": [dict(s) for s in svc_lines],
            })

        return {
            "batch": dict(batch),
            "claims": claim_data,
        }


# ─── DENIAL WORKLIST ────────────────────────────────────────────────────────

@router.get("/denials")
async def denial_worklist(
    org_id: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    """
    Get actionable denials from remittance data.
    Pre-classified by CARC category with suggested actions.
    """
    conditions = ["rc.is_denial = TRUE"]
    params = []
    idx = 1

    if org_id:
        conditions.append(f"rc.org_id=${idx}")
        params.append(_uuid.UUID(org_id))
        idx += 1
    if category:
        conditions.append(f"ra.denial_category=${idx}")
        params.append(category)
        idx += 1

    where = "WHERE " + " AND ".join(conditions)

    async with get_db() as conn:
        params.append(limit)
        rows = await conn.fetch(f"""
            SELECT
                rc.id, rc.patient_control_number, rc.order_id,
                rc.billed_amount, rc.paid_amount, rc.patient_responsibility,
                rc.patient_last_name, rc.patient_first_name,
                rc.service_date_start,
                rb.payer_name, rb.check_date,
                ra.carc_code, ra.rarc_code, ra.denial_category,
                ra.suggested_action, ra.adjustment_amount, ra.is_actionable,
                ra.adjustment_group
            FROM remittance_claims rc
            JOIN remittance_batches rb ON rb.id = rc.batch_id
            LEFT JOIN remittance_adjustments ra ON ra.remittance_claim_id = rc.id
            {where}
            ORDER BY rc.created_at DESC
            LIMIT ${idx}
        """, *params)

        denials = [dict(r) for r in rows]

        # Summary by category
        cat_summary = {}
        for d in denials:
            cat = d.get("denial_category", "other")
            if cat not in cat_summary:
                cat_summary[cat] = {"count": 0, "total_amount": 0}
            cat_summary[cat]["count"] += 1
            cat_summary[cat]["total_amount"] += float(d.get("billed_amount") or 0)

        return {
            "total": len(denials),
            "denials": denials,
            "by_category": cat_summary,
        }


# ─── REMITTANCE KPIS ────────────────────────────────────────────────────────

@router.get("/stats")
async def remittance_stats(org_id: Optional[str] = None, days: int = Query(30, ge=7, le=365)):
    """Remittance KPIs for executive dashboard."""
    org_filter = "AND rb.org_id=$2" if org_id else ""
    params = [days, _uuid.UUID(org_id)] if org_id else [days]

    async with get_db() as conn:
        stats = await conn.fetchrow(f"""
            SELECT
                COUNT(DISTINCT rb.id) AS batch_count,
                COUNT(rc.id) AS total_claims,
                SUM(rc.billed_amount) AS total_billed,
                SUM(rc.paid_amount) AS total_paid,
                SUM(CASE WHEN rc.is_denial THEN 1 ELSE 0 END) AS total_denials,
                SUM(CASE WHEN rc.is_partial_pay THEN 1 ELSE 0 END) AS total_partial,
                ROUND(
                    SUM(CASE WHEN rc.is_denial THEN 1 ELSE 0 END)::NUMERIC /
                    NULLIF(COUNT(rc.id), 0) * 100, 1
                ) AS denial_rate,
                ROUND(
                    SUM(rc.paid_amount)::NUMERIC /
                    NULLIF(SUM(rc.billed_amount), 0) * 100, 1
                ) AS collection_rate
            FROM remittance_claims rc
            JOIN remittance_batches rb ON rb.id = rc.batch_id
            WHERE rb.received_at >= NOW() - INTERVAL '1 day' * $1
            {org_filter}
        """, *params)

        # Top denial CARCs
        top_carcs = await conn.fetch(f"""
            SELECT ra.carc_code, ra.denial_category, COUNT(*) AS count,
                   SUM(ra.adjustment_amount) AS total_amount
            FROM remittance_adjustments ra
            JOIN remittance_claims rc ON rc.id = ra.remittance_claim_id
            JOIN remittance_batches rb ON rb.id = rc.batch_id
            WHERE ra.is_actionable = TRUE
              AND rb.received_at >= NOW() - INTERVAL '1 day' * $1
              {org_filter}
            GROUP BY ra.carc_code, ra.denial_category
            ORDER BY count DESC
            LIMIT 10
        """, *params)

        # By payer
        by_payer = await conn.fetch(f"""
            SELECT rb.payer_name,
                   COUNT(rc.id) AS claims,
                   SUM(rc.billed_amount) AS billed,
                   SUM(rc.paid_amount) AS paid,
                   SUM(CASE WHEN rc.is_denial THEN 1 ELSE 0 END) AS denials
            FROM remittance_claims rc
            JOIN remittance_batches rb ON rb.id = rc.batch_id
            WHERE rb.received_at >= NOW() - INTERVAL '1 day' * $1
            {org_filter}
            GROUP BY rb.payer_name
            ORDER BY claims DESC
            LIMIT 15
        """, *params)

        return {
            "period_days": days,
            "summary": dict(stats) if stats else {},
            "top_denial_codes": [dict(r) for r in top_carcs],
            "by_payer": [dict(r) for r in by_payer],
        }


# ─── HELPERS ─────────────────────────────────────────────────────────────────

async def _resolve_order_uuid(patient_control_number: str, conn) -> Optional[_uuid.UUID]:
    """
    Resolve patient_control_number back to an order UUID.
    Format: ORD-<first8chars-of-uuid> — look up by prefix match.
    Falls back to exact order_number match.
    """
    if not patient_control_number:
        return None
    pcn = patient_control_number.strip()

    # Try ORD-<uuid_prefix> format
    if pcn.upper().startswith("ORD-"):
        prefix = pcn[4:].lower()
        row = await conn.fetchrow(
            "SELECT id FROM orders WHERE id::TEXT LIKE $1 LIMIT 1",
            f"{prefix}%",
        )
        if row:
            return row["id"]

    # Try order_number match
    row = await conn.fetchrow(
        "SELECT id FROM orders WHERE order_number=$1 LIMIT 1",
        pcn,
    )
    if row:
        return row["id"]

    return None
