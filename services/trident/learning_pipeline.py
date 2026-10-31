"""Durable SPEAR feedback ingestion. Evidence never creates a payment label.

All writes are to TRIDENT-owned tables. Claims, appeals, remittances, source
documents and financial postings remain unchanged. Source keys acknowledge an
exact source revision; retries and backfills cannot duplicate that revision.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from psycopg.rows import dict_row

EVENT_TYPES = [
    "trident_rcm_feedback", "appeal_submitted", "claim_diagnosis_refile",
    "claim_submitted", "manual_rcm_posting", "remittance_recovery_action",
    "recovery_register_action", "remittance_line_posted", "remittance_denied",
    "remittance_paid", "remittance_partial_paid", "remittance_reversal",
]


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    # Reject model objects rather than hiding them behind str()/default=str.
    raise TypeError(f"Unsupported JSON metadata type: {type(value).__name__}")


def fingerprint(value: Any) -> str:
    return hashlib.sha256(json.dumps(json_safe(value), sort_keys=True, separators=(",", ":")).encode()).hexdigest()


async def rows(conn, query: str, params=()) -> list[dict]:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute(query, params)
        return [dict(row) for row in await cur.fetchall()]


async def execute(conn, query: str, params=()):
    async with conn.cursor() as cur:
        await cur.execute(query, params)
        return cur.rowcount


async def ensure_schema(conn):
    # Run before ingestion/training on startup, never from an unauthenticated read.
    await execute(conn, Path(__file__).with_name("learning_schema.sql").read_text())


async def table_exists(conn, name: str) -> bool:
    result = await rows(conn, "SELECT to_regclass(%s) IS NOT NULL AS present", (name,))
    return bool(result[0]["present"])


def event_record(row: dict) -> dict:
    raw = row["event"]
    data = raw.get("workbench_data") or {}
    if not isinstance(data, dict):
        data = {}
    detail = raw.get("detail") or ""
    try:
        parsed = json.loads(detail)
        detail = parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        detail = {}
    typ = str(raw["event_type"])
    kind = ("APPEAL" if typ == "appeal_submitted" else "REBILL" if typ == "claim_diagnosis_refile"
            else "SUBMISSION" if typ == "claim_submitted" else "OPERATOR_DECISION" if typ == "trident_rcm_feedback"
            else "REMITTANCE_EVIDENCE")
    # Keep references, coding changes and decisions. Do not duplicate patient or
    # member identifiers, signed-document bytes, addresses or full 837 payloads.
    proposed = data.get("proposed") or {}
    proposal = data.get("proposal") or {}
    evidence = {
        "event_type": typ, "transaction_id": raw.get("stedi_transaction_id"),
        "source_hash": data.get("sourceHash") or raw.get("payload_sha256"),
        "feedback_id": data.get("feedback_id"), "source_id": data.get("sourceId"),
        "case_id": data.get("caseId"), "payer_claim_numbers": raw.get("payer_claim_control_numbers") or [],
        "decision": data.get("decision"), "status": data.get("status"),
        "receipt": data.get("receipt"), "appeal_id": detail.get("appeal_id"),
        "fax_receipt": detail.get("telnyx_fax_id"), "delivery_confirmed": detail.get("delivery_confirmed"),
        "hcpcs": raw.get("hcpcs") or row.get("order_hcpcs") or [], "service_dates": raw.get("dos") or [],
        "coding_changes": data.get("input"), "review_fingerprint": proposal.get("fingerprint"),
        "submitted_control_number": (proposed.get("claimInformation") or {}).get("patientControlNumber"),
        "training_state": "EVIDENCE_INDEXED",
    }
    return {
        "source_key": f"ledger_events:{raw['event_id']}", "org_id": row.get("org_id"),
        "order_id": data.get("orderId") or row.get("order_id"),
        "claim_number": raw.get("patient_control_number"),
        "claim_version": data.get("claimVersion") or data.get("sourceTransactionId") or
                         (raw.get("stedi_transaction_id") if typ == "claim_submitted" else None),
        "payer_id": row.get("payer_id"), "payer_name": raw.get("payer") or row.get("payer_name"),
        "record_kind": kind, "source_table": "ledger_events", "source_id": str(raw["event_id"]),
        "source_hash": fingerprint(raw), "evidence": evidence, "occurred_at": raw.get("occurred_at"),
    }


async def save_record(conn, record: dict) -> int:
    return await execute(conn, """
        INSERT INTO trident_feedback_ingestion
          (source_key,org_id,order_id,claim_number,claim_version,payer_id,payer_name,
           record_kind,source_table,source_id,source_hash,evidence,occurred_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s)
        ON CONFLICT(source_key) DO UPDATE SET org_id=EXCLUDED.org_id,
          order_id=COALESCE(trident_feedback_ingestion.order_id,EXCLUDED.order_id),evidence=EXCLUDED.evidence
        WHERE trident_feedback_ingestion.org_id IS NULL AND EXCLUDED.org_id IS NOT NULL
        """, tuple(record.get(k) for k in (
            "source_key", "org_id", "order_id", "claim_number", "claim_version", "payer_id", "payer_name",
            "record_kind", "source_table", "source_id", "source_hash")) +
        (json.dumps(json_safe(record["evidence"])), record.get("occurred_at")))


async def ingest_sources(conn, max_pages: int = 20) -> dict:
    """Anti-join receipts rather than a high-water mark: late source commits
    remain discoverable even when their sequence id precedes an earlier page."""
    lock = await rows(conn, "SELECT pg_try_advisory_xact_lock(817260031) AS acquired")
    if not lock[0]["acquired"]:
        return {"state": "BUSY", "ingested": 0}
    inserted = 0
    if await table_exists(conn, "ledger_events") and await table_exists(conn, "ledger_claim_links"):
        for _ in range(max_pages):
            page = await rows(conn, """
                SELECT to_jsonb(e) AS event, o.org_id::text AS org_id, o.id::text AS order_id,
                       lc.payer_id, lc.payer_name,to_jsonb(o)->'hcpcs_codes' AS order_hcpcs
                FROM ledger_events e
                LEFT JOIN ledger_claim_links l USING(patient_control_number)
                LEFT JOIN orders o ON o.id::text=COALESCE(NULLIF(e.workbench_data->>'orderId',''), to_jsonb(l)->>'order_id')
                LEFT JOIN ledger_claims lc USING(patient_control_number)
                WHERE e.event_type=ANY(%s) AND NOT EXISTS (
                  SELECT 1 FROM trident_feedback_ingestion f WHERE f.source_key='ledger_events:'||e.event_id::text
                    AND (f.org_id IS NOT NULL OR (o.org_id IS NULL AND e.workbench_data->>'orgId' IS NULL)))
                ORDER BY e.event_id LIMIT 500
                """, (EVENT_TYPES,))
            for row in page:
                record = event_record(row)
                # RCM records carry the authoritative organization even before
                # the order can be matched. Unattributed sources stay quarantined.
                raw_org = (row["event"].get("workbench_data") or {}).get("orgId")
                if raw_org:
                    import uuid
                    try:
                        record["org_id"] = str(uuid.UUID(str(raw_org)))
                    except ValueError:
                        record["org_id"] = None
                inserted += await save_record(conn, record)
            if len(page) < 500:
                break
    if await table_exists(conn, "appeals"):
        # Prepared packets and later status revisions belong to the same history.
        # Store document references only; originals remain in order_documents.
        appeals = await rows(conn, """SELECT to_jsonb(a) AS item,to_jsonb(d) AS denial,to_jsonb(o) AS order_context
            FROM appeals a LEFT JOIN denials d ON d.id::text=to_jsonb(a)->>'denial_id'
            LEFT JOIN orders o ON o.id::text=to_jsonb(a)->>'order_id'"""
        )
        for row in appeals:
            a = row["item"]
            denial=row.get("denial") or {}
            order=row.get("order_context") or {}
            revision = fingerprint({k: a.get(k) for k in ("status", "submitted_at", "decided_at", "letter_storage_key", "supporting_docs", "updated_at", "notes")})
            evidence = {k: a.get(k) for k in ("denial_id", "appeal_level", "status", "submitted_at", "decided_at", "letter_storage_key", "supporting_docs", "notes")}
            evidence["hcpcs"]=[denial["hcpcs_code"]] if denial.get("hcpcs_code") else order.get("hcpcs_codes") or []
            inserted += await save_record(conn, {
                "source_key": f"appeals:{a['id']}:{revision}", "source_table": "appeals", "source_id": str(a["id"]),
                "source_hash": revision, "org_id": a.get("org_id"), "order_id": a.get("order_id"),
                "claim_number":denial.get("patient_control_number") or denial.get("claim_number") or denial.get("control_number"),
                "payer_id":denial.get("payer_id") or order.get("payer_id"),"payer_name":denial.get("payer_name"),
                "record_kind": "APPEAL_PACKET", "evidence": evidence,
                "occurred_at": a.get("updated_at") or a.get("created_at"),
            })
    result = {"state": "INGESTED", "ingested": inserted}
    await execute(conn, """INSERT INTO trident_learning_jobs(job_key,last_success_at,last_result,last_error)
        VALUES ('feedback_ingestion',NOW(),%s::jsonb,NULL) ON CONFLICT(job_key) DO UPDATE
        SET last_success_at=NOW(),last_result=EXCLUDED.last_result,last_error=NULL""", (json.dumps(result),))
    return result


async def feedback_status(conn, org_id: str) -> dict:
    counts = await rows(conn, """SELECT record_kind,COUNT(*) AS count
        FROM trident_feedback_ingestion WHERE org_id=%s::uuid GROUP BY record_kind""", (org_id,))
    recent = await rows(conn, """SELECT f.source_key,f.record_kind,f.claim_version,f.ingested_at,
            CASE WHEN m.model_version IS NOT NULL THEN 'TRAINED'
                 WHEN f.record_kind='PAYER_OUTCOME' THEN 'AWAITING_WEEKLY_TRAINING'
                 ELSE 'EVIDENCE_INDEXED' END AS learning_state,m.model_version
        FROM trident_feedback_ingestion f LEFT JOIN LATERAL (
          SELECT model_version FROM trident_training_membership m WHERE m.source_key=f.source_key
          ORDER BY model_version DESC LIMIT 1) m ON true
        WHERE f.org_id=%s::uuid ORDER BY f.ingested_at DESC,f.source_key LIMIT 30""", (org_id,))
    job = await rows(conn, "SELECT last_success_at,last_error_at,last_error,last_result FROM trident_learning_jobs WHERE job_key='feedback_ingestion'")
    return json_safe({"counts": {r["record_kind"]: r["count"] for r in counts}, "recent": recent,
                      "ingestion": job[0] if job else None})


async def index_outcomes(conn) -> int:
    # A source revision has its own key. Model membership can therefore be proved
    # without changing payment_outcomes or claiming an operator action was paid.
    outcome_rows = await rows(conn, "SELECT to_jsonb(p) AS item FROM payment_outcomes p WHERE is_denial IS NOT NULL AND adjudicated_at IS NOT NULL")
    count = 0
    for row in outcome_rows:
        p = row["item"]
        count += await save_record(conn, outcome_record(p))
    return count


def outcome_record(p: dict) -> dict:
    evidence = {k: p.get(k) for k in ("payer_id", "payer_name", "hcpcs_code", "icd10_code", "diagnosis_codes", "billed_amount", "paid_amount", "is_denial", "carc_code", "rarc_code", "date_of_service", "adjudicated_at", "external_claim_number", "payment_date", "eob_reference", "adjustment_codes")}
    revision = fingerprint(evidence)
    return {
        "source_key": f"payment_outcomes:{p['id']}:{revision}", "org_id": p.get("org_id"),
        "order_id": p.get("order_id"), "claim_number": p.get("claim_number"),
        "claim_version": p.get("claim_version"), "payer_id": p.get("payer_id"), "payer_name": p.get("payer_name"),
        "record_kind": "PAYER_OUTCOME", "source_table": "payment_outcomes", "source_id": str(p["id"]),
        "source_hash": revision, "evidence": evidence, "occurred_at": p.get("adjudicated_at"),
    }
