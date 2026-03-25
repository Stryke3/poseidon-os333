"""
POSEIDON EDI Service — 835 Inbound Remittance Routes

Endpoints:
  POST /api/v1/remittance/upload          — Upload 835 EDI file or PDF EOB
  POST /api/v1/remittance/parse-raw       — Parse raw X12 835 string
  GET  /api/v1/remittance/batches         — List remittance batches
  GET  /api/v1/remittance/batch/{id}      — Get batch detail with claims
  POST /api/v1/remittance/batch/{id}/post — Auto-post payments to orders
  GET  /api/v1/remittance/denials         — Denial worklist from remittance
  GET  /api/v1/remittance/stats           — Remittance KPIs
"""
import io
import json
import logging
import uuid as _uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Form
from pydantic import BaseModel

from app.database import get_db, get_db_transaction, audit_log, to_json
from app.parsers.era_835 import parse_835_x12, classify_carc

log = logging.getLogger("edi.routes.remittance")
router = APIRouter(prefix="/api/v1/remittance", tags=["835 Remittance"])


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
    header = parsed.get("header", {})
    claims = parsed.get("claims", [])

    if not claims:
        raise HTTPException(400, "No claims found in 835 file")

    # Store batch + claims + adjustments + service lines
    async with get_db_transaction() as conn:
        batch_id = await conn.fetchval("""
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
            file.filename,
            source,
            content_str,
            header.get("interchange_control_num"),
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

            # Look up claim_submission if exists
            submission_id = None
            if resolved_order_id:
                submission_id = await conn.fetchval(
                    "SELECT id FROM claim_submissions WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1",
                    resolved_order_id,
                )

            rc_id = await conn.fetchval("""
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
                batch_id, org_uuid, pcn, resolved_order_id,
                submission_id, claim.get("payer_claim_number"),
                claim.get("claim_status_code"), float(claim.get("billed_amount", 0)),
                float(claim.get("paid_amount", 0)), float(claim.get("patient_responsibility", 0)),
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

            # Store adjustments
            for adj in claim.get("adjustments", []):
                await conn.execute("""
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

            # Store service lines
            for svc in claim.get("service_lines", []):
                await conn.execute("""
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

            # Update order claim_status if we resolved it
            if resolved_order_id:
                new_status = "denied" if claim.get("is_denial") else "paid" if float(claim.get("paid_amount", 0)) > 0 else "adjudicated"
                await conn.execute(
                    "UPDATE orders SET claim_status=$2, updated_at=NOW() WHERE id=$1",
                    resolved_order_id, new_status,
                )

        await audit_log(conn, "remittance_batch", batch_id, "parsed",
                        new_status="parsed",
                        details={
                            "claims": len(claims),
                            "denials": denial_count,
                            "filename": file.filename,
                        })

    if denial_count > 0:
        log.info(f"Batch {batch_id}: {denial_count} denials queued for Trident training")

    return {
        "batch_id": str(batch_id),
        "filename": file.filename,
        "status": "parsed",
        "summary": parsed["summary"],
        "payer": header.get("payer_name"),
        "check_number": header.get("check_number"),
        "denials_found": denial_count,
    }


# ─── PARSE RAW X12 STRING ───────────────────────────────────────────────────

@router.post("/parse-raw")
async def parse_raw_835(content: str = Form(...)):
    """Parse raw X12 835 string without storing. For testing/preview."""
    parsed = parse_835_x12(content)
    return parsed


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
