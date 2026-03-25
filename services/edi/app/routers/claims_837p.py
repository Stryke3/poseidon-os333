"""
POSEIDON EDI Service — 837P Outbound Claim Submission Routes

Endpoints:
  POST /api/v1/claims/submit/{order_id}       — Submit single claim
  POST /api/v1/claims/submit/batch             — Submit batch of orders
  POST /api/v1/claims/resubmit/{submission_id} — Resubmit corrected claim
  GET  /api/v1/claims/status/{order_id}        — Get submission status
  POST /api/v1/claims/poll-ack/{submission_id} — Poll for 999/277 acknowledgment
  POST /api/v1/claims/validate/{order_id}      — Dry-run validation only
  GET  /api/v1/claims/submissions              — List submissions with filters
"""
import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel

from app.database import get_db, get_db_transaction, audit_log, to_json
from app.builders.claim_837p import fetch_claim_data, build_837p_payload
from app.builders.x12_837p import generate_837p
from app.clients.stedi import stedi_client
from app.clients.availity_sftp import availity_sftp

log = logging.getLogger("edi.routes.claims")
router = APIRouter(prefix="/api/v1/claims", tags=["837P Claims"])

DRY_RUN = False  # set from env in main.py
SUBMISSION_METHOD = "availity_sftp"  # set from env in main.py: availity_sftp or stedi_api


class BatchSubmitRequest(BaseModel):
    order_ids: list[str]  # UUID strings


class SubmissionResponse(BaseModel):
    status: str
    submission_id: Optional[str] = None
    icn: Optional[str] = None
    message: Optional[str] = None
    errors: Optional[list] = None


# --- PRE-SUBMISSION VALIDATION ---

async def _validate_order_for_submission(order_id: str, conn) -> list:
    """Check all required fields exist before building 837P."""
    errors = []

    oid = uuid.UUID(order_id) if isinstance(order_id, str) else order_id
    order = await conn.fetchrow("SELECT * FROM orders WHERE id=$1", oid)
    if not order:
        return [f"Order {order_id} not found"]

    # Patient
    patient = await conn.fetchrow("SELECT * FROM patients WHERE id=$1", order["patient_id"])
    if not patient:
        errors.append("No patient linked to order")
    else:
        if not patient.get("first_name"):
            errors.append("Patient first name missing")
        if not patient.get("last_name"):
            errors.append("Patient last name missing")
        if not patient.get("dob"):
            errors.append("Patient DOB missing")
        if not patient.get("insurance_member_id"):
            errors.append("Patient insurance member ID missing")
        if not patient.get("address1"):
            errors.append("Patient address missing")

    # Organization (billing provider)
    org = await conn.fetchrow("SELECT * FROM organizations WHERE id=$1", order["org_id"])
    if not org:
        errors.append("No organization linked to order")
    else:
        if not org.get("billing_npi"):
            errors.append("Organization billing NPI missing")
        if not org.get("tax_id"):
            errors.append("Organization Tax ID missing")

    # Payer
    if not order.get("payer_id"):
        errors.append("No payer assigned to order")

    # HCPCS
    has_lines = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM order_line_items WHERE order_id=$1)", oid
    )
    if not has_lines and not order.get("hcpcs_code") and not order.get("hcpcs_codes"):
        errors.append("No HCPCS code — need either order hcpcs_codes or order_line_items")

    # Diagnoses
    diag_count = await conn.fetchval(
        "SELECT COUNT(*) FROM order_diagnoses WHERE order_id=$1", oid
    )
    if diag_count == 0:
        errors.append("No diagnosis codes attached to order")

    # Billed amount
    if not has_lines and not order.get("billed_amount"):
        errors.append("No billed amount set")

    # DOS
    if not order.get("dos_start"):
        errors.append("Date of service (dos_start) missing")

    return errors


# --- SUBMIT SINGLE CLAIM ---

@router.post("/submit/{order_id}", response_model=SubmissionResponse)
async def submit_claim(order_id: str, background_tasks: BackgroundTasks, triggered_by: Optional[str] = None):
    """
    Submit a single 837P claim for an order.
    Validates, builds payload, submits via Availity SFTP or Stedi API, stores result.
    """
    oid = uuid.UUID(order_id)
    triggered_uuid = uuid.UUID(triggered_by) if triggered_by else None

    async with get_db_transaction() as conn:
        # Validate
        errors = await _validate_order_for_submission(order_id, conn)
        if errors:
            return SubmissionResponse(status="validation_failed", errors=errors)

        # Check not already accepted
        existing = await conn.fetchrow(
            "SELECT id, status FROM claim_submissions WHERE order_id=$1 AND status='accepted' ORDER BY id DESC LIMIT 1",
            oid,
        )
        if existing:
            return SubmissionResponse(
                status="already_accepted",
                submission_id=str(existing["id"]),
                message=f"Order {order_id} already has an accepted submission",
            )

        # Generate ICN
        icn = await conn.fetchval("SELECT LPAD(nextval('edi_icn_seq')::TEXT, 9, '0')")

        # Build payload
        order, diags, lines = await fetch_claim_data(oid, conn)
        payload = build_837p_payload(order, diags, lines, icn)

        claim_number = f"ORD-{str(oid)[:8].upper()}"

        # Insert submission record
        sub_id = await conn.fetchval("""
            INSERT INTO claim_submissions
                (order_id, org_id, payer_id, claim_number, interchange_control_number,
                 submission_payload, status, triggered_by, validated_at)
            VALUES ($1, $2, $3, $4, $5, $6::JSONB, 'validated', $7, NOW())
            RETURNING id
        """, oid, order["org_id"], order.get("payer_id"),
            claim_number, icn,
            to_json(payload), triggered_uuid)

        await audit_log(conn, "claim_submission", sub_id, "created",
                        new_status="validated", details={"order_id": str(oid), "icn": icn})

        if DRY_RUN:
            # Also generate raw X12 for preview
            raw_x12 = generate_837p(order, diags, lines, icn)
            await conn.execute(
                "UPDATE claim_submissions SET status='dry_run', raw_x12_outbound=$2 WHERE id=$1",
                sub_id, raw_x12,
            )
            return SubmissionResponse(
                status="dry_run", submission_id=str(sub_id), icn=icn,
                message="Payload built successfully (dry run mode — not submitted to clearinghouse)",
            )

        # -- SUBMIT: Branch on method ---
        try:
            if SUBMISSION_METHOD == "availity_sftp":
                # Generate raw X12 837P and upload to Availity SFTP
                raw_x12 = generate_837p(order, diags, lines, icn)
                result = await availity_sftp.submit_837p(raw_x12)

                await conn.execute("""
                    UPDATE claim_submissions
                    SET status='submitted', submission_method='availity_sftp',
                        clearinghouse='availity', raw_x12_outbound=$2,
                        acknowledgment_payload=$3::JSONB, submitted_at=NOW(), updated_at=NOW()
                    WHERE id=$1
                """, sub_id, raw_x12, to_json(result))

                await conn.execute(
                    "UPDATE orders SET claim_status='submitted', last_submitted_at=NOW() WHERE id=$1",
                    oid,
                )

                await audit_log(conn, "claim_submission", sub_id, "submitted_sftp",
                                old_status="validated", new_status="submitted",
                                details={"filename": result.get("filename"), "host": result.get("host")})

                return SubmissionResponse(
                    status="submitted", submission_id=str(sub_id), icn=icn,
                    message=f"837P uploaded to Availity SFTP ({result.get('filename')})",
                )

            else:
                # Submit via Stedi API (JSON -> X12 handled by Stedi)
                result = await stedi_client.submit_837p(payload)

                stedi_tx_id = result.get("transactionId", "")
                raw_x12 = result.get("rawX12", "")
                ack_status = result.get("acknowledgmentStatus", "pending")

                status = "accepted" if ack_status in ("accepted", "A") else "submitted"

                await conn.execute("""
                    UPDATE claim_submissions
                    SET status=$2, submission_method='stedi_api', clearinghouse='stedi',
                        stedi_transaction_id=$3, raw_x12_outbound=$4,
                        acknowledgment_payload=$5::JSONB, submitted_at=NOW(), updated_at=NOW()
                    WHERE id=$1
                """, sub_id, status, stedi_tx_id, raw_x12, to_json(result))

                await conn.execute(
                    "UPDATE orders SET claim_status='submitted', last_submitted_at=NOW() WHERE id=$1",
                    oid,
                )

                await audit_log(conn, "claim_submission", sub_id, "submitted_stedi",
                                old_status="validated", new_status=status,
                                details={"stedi_tx_id": stedi_tx_id})

                # Schedule ack polling if not immediately accepted
                if status == "submitted":
                    background_tasks.add_task(_poll_acknowledgment_task, sub_id, stedi_tx_id)

                return SubmissionResponse(
                    status=status, submission_id=str(sub_id), icn=icn,
                    message=f"Claim submitted via Stedi (tx: {stedi_tx_id})",
                )

        except Exception as e:
            await conn.execute("""
                UPDATE claim_submissions SET status='failed', failure_reason=$2, updated_at=NOW()
                WHERE id=$1
            """, sub_id, str(e)[:1000])

            await audit_log(conn, "claim_submission", sub_id, "submission_failed",
                            old_status="validated", new_status="failed",
                            details={"error": str(e)[:500], "method": SUBMISSION_METHOD})

            log.error(f"Claim submission failed for order {order_id}: {e}")
            return SubmissionResponse(
                status="failed", submission_id=str(sub_id), icn=icn,
                message=f"Submission failed: {str(e)[:200]}",
            )


# --- BATCH SUBMIT ---

@router.post("/submit/batch", response_model=dict)
async def submit_batch(request: BatchSubmitRequest, background_tasks: BackgroundTasks, triggered_by: Optional[str] = None):
    """Submit multiple claims in a batch. Each order processed independently."""
    batch_id = f"BATCH-{uuid.uuid4().hex[:12].upper()}"

    results = []
    for order_id in request.order_ids:
        try:
            result = await submit_claim(order_id, background_tasks, triggered_by)
            # Tag with batch_id
            if result.submission_id:
                async with get_db() as conn:
                    await conn.execute(
                        "UPDATE claim_submissions SET batch_id=$2 WHERE id=$1",
                        result.submission_id, batch_id,
                    )
            results.append({"order_id": order_id, **result.model_dump()})
        except Exception as e:
            results.append({"order_id": order_id, "status": "error", "message": str(e)[:200]})

    succeeded = sum(1 for r in results if r["status"] in ("accepted", "submitted", "dry_run"))
    return {
        "batch_id": batch_id,
        "total": len(request.order_ids),
        "succeeded": succeeded,
        "failed": len(request.order_ids) - succeeded,
        "results": results,
    }


# --- RESUBMIT ---

@router.post("/resubmit/{submission_id}", response_model=SubmissionResponse)
async def resubmit_claim(submission_id: str, background_tasks: BackgroundTasks, triggered_by: Optional[str] = None):
    """Resubmit a previously rejected or failed claim."""
    sid = uuid.UUID(submission_id)
    async with get_db() as conn:
        original = await conn.fetchrow(
            "SELECT order_id, submission_count FROM claim_submissions WHERE id=$1", sid,
        )
        if not original:
            raise HTTPException(404, "Submission not found")

        # Submit as new with parent reference
        result = await submit_claim(str(original["order_id"]), background_tasks, triggered_by)

        if result.submission_id:
            async with get_db() as conn2:
                await conn2.execute("""
                    UPDATE claim_submissions
                    SET parent_submission_id=$2, submission_count=$3
                    WHERE id=$1
                """, uuid.UUID(result.submission_id), sid, original["submission_count"] + 1)

        return result


# --- VALIDATE ONLY (DRY RUN) ---

@router.post("/validate/{order_id}")
async def validate_claim(order_id: str):
    """Validate an order for 837P submission without actually submitting."""
    oid = uuid.UUID(order_id)
    async with get_db() as conn:
        errors = await _validate_order_for_submission(order_id, conn)
        if errors:
            return {"valid": False, "errors": errors}

        order, diags, lines = await fetch_claim_data(oid, conn)
        payload = build_837p_payload(order, diags, lines, "000000000")

        return {
            "valid": True,
            "claim_number": f"ORD-{str(oid)[:8].upper()}",
            "total_charge": payload["claimInformation"]["claimChargeAmount"],
            "service_lines": len(payload.get("serviceLines", [])),
            "diagnosis_codes": len(payload.get("diagnosisCodes", [])),
            "payer": payload.get("receiver", {}).get("organizationName"),
            "payload_preview": payload,
        }


# --- STATUS CHECK ---

@router.get("/status/{order_id}")
async def get_submission_status(order_id: str):
    """Get latest submission status for an order."""
    oid = uuid.UUID(order_id)
    async with get_db() as conn:
        rows = await conn.fetch("""
            SELECT id, status, interchange_control_number, stedi_transaction_id,
                   failure_reason, rejection_codes, submission_count,
                   submitted_at, acknowledged_at, created_at
            FROM claim_submissions
            WHERE order_id=$1
            ORDER BY created_at DESC
            LIMIT 5
        """, oid)

        if not rows:
            return {"order_id": order_id, "status": "not_submitted", "submissions": []}

        return {
            "order_id": order_id,
            "current_status": rows[0]["status"],
            "submissions": [dict(r) for r in rows],
        }


# --- LIST SUBMISSIONS ---

@router.get("/submissions")
async def list_submissions(
    status: Optional[str] = None,
    org_id: Optional[int] = None,
    batch_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List claim submissions with optional filters."""
    conditions = []
    params = []
    idx = 1

    if status:
        conditions.append(f"status=${idx}")
        params.append(status)
        idx += 1
    if org_id:
        conditions.append(f"org_id=${idx}")
        params.append(org_id)
        idx += 1
    if batch_id:
        conditions.append(f"batch_id=${idx}")
        params.append(batch_id)
        idx += 1

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    async with get_db() as conn:
        total = await conn.fetchval(f"SELECT COUNT(*) FROM claim_submissions {where}", *params)

        params.extend([limit, offset])
        rows = await conn.fetch(f"""
            SELECT id, order_id, org_id, claim_number, status, interchange_control_number,
                   stedi_transaction_id, failure_reason, batch_id, submission_count,
                   submitted_at, acknowledged_at, created_at
            FROM claim_submissions {where}
            ORDER BY id DESC
            LIMIT ${idx} OFFSET ${idx + 1}
        """, *params)

        return {"total": total, "submissions": [dict(r) for r in rows]}


# --- ACK POLLING ---

@router.post("/poll-ack/{submission_id}")
async def poll_acknowledgment(submission_id: str):
    """Manually poll Stedi for acknowledgment on a pending submission."""
    sid = uuid.UUID(submission_id)
    async with get_db() as conn:
        sub = await conn.fetchrow(
            "SELECT stedi_transaction_id, status FROM claim_submissions WHERE id=$1",
            sid,
        )
        if not sub:
            raise HTTPException(404, "Submission not found")
        if not sub["stedi_transaction_id"]:
            return {"status": sub["status"], "message": "No Stedi transaction ID — cannot poll"}

        result = await stedi_client.get_acknowledgment(sub["stedi_transaction_id"])
        if not result:
            return {"status": sub["status"], "message": "No acknowledgment available yet"}

        ack_status = result.get("status", "unknown")
        new_status = "accepted" if ack_status in ("accepted", "A") else "rejected" if ack_status in ("rejected", "R") else sub["status"]

        await conn.execute("""
            UPDATE claim_submissions
            SET status=$2, acknowledgment_payload=$3::JSONB, acknowledged_at=NOW(), updated_at=NOW()
            WHERE id=$1
        """, sid, new_status, to_json(result))

        if new_status == "rejected":
            rejection_codes = result.get("errors", [])
            await conn.execute(
                "UPDATE claim_submissions SET rejection_codes=$2::JSONB WHERE id=$1",
                sid, to_json(rejection_codes),
            )

        await audit_log(conn, "claim_submission", sid, "ack_received",
                        old_status=sub["status"], new_status=new_status)

        return {"status": new_status, "acknowledgment": result}


async def _poll_acknowledgment_task(submission_id, stedi_tx_id: str):
    """Background task: poll Stedi for ack with exponential backoff."""
    import asyncio
    delays = [10, 30, 60, 120, 300]  # seconds
    for delay in delays:
        await asyncio.sleep(delay)
        try:
            result = await stedi_client.get_acknowledgment(stedi_tx_id)
            if result and result.get("status") in ("accepted", "rejected", "A", "R"):
                async with get_db() as conn:
                    new_status = "accepted" if result["status"] in ("accepted", "A") else "rejected"
                    await conn.execute("""
                        UPDATE claim_submissions
                        SET status=$2, acknowledgment_payload=$3::JSONB, acknowledged_at=NOW(), updated_at=NOW()
                        WHERE id=$1
                    """, submission_id, new_status, to_json(result))
                    await audit_log(conn, "claim_submission", submission_id, "ack_polled",
                                    new_status=new_status)
                log.info(f"Submission {submission_id} ack: {new_status}")
                return
        except Exception as e:
            log.warning(f"Ack poll failed for {submission_id}: {e}")
    log.warning(f"Submission {submission_id}: ack polling exhausted after {sum(delays)}s")
