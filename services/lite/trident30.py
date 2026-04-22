"""
TRIDENT 3.0 — intake, coding cover, POD/DocuSign, final packet, Tebra handoff, audit.
Order ID is the same UUID as lite.patients.id (one order per case for MVP).
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import asyncpg

# Document classes allowed on intake (aligned with spec; includes legacy aliases).
TRIDENT_DOC_CLASSES = frozenset(
    {
        "rx_order",
        "facesheet",
        "insurance_card_front",
        "insurance_card_back",
        "chart_note",
        "swo",
        "payer_addendum",
        "coding_cover_sheet",
        "proof_of_delivery_unsigned",
        "proof_of_delivery_signed",
        "delivery_tracking",
        "final_packet",
        # legacy compatibility
        "intake",
        "insurance",
        "rx",
        "pod",
        "medical_records",
        "billing",
        "other",
    }
)

CODING_COVER_SHEET_STATUS = frozenset({"not_started", "draft", "generated", "approved"})
POD_STATUS = frozenset({"not_required", "pending_send", "sent", "completed", "failed", "voided"})
FINAL_PACKET_STATUS = frozenset({"not_started", "assembling", "assembled", "saved_to_tebra"})
TEBRA_RECORD_STATUS = frozenset({"not_sent", "sent", "saved", "rejected", "retry_required"})

WORKFLOW_DDL = """
CREATE TABLE IF NOT EXISTS lite.order_workflow (
    order_id UUID PRIMARY KEY REFERENCES lite.patients(id) ON DELETE CASCADE,
    coding_cover_sheet_status TEXT NOT NULL DEFAULT 'not_started',
    pod_status TEXT NOT NULL DEFAULT 'not_required',
    final_packet_status TEXT NOT NULL DEFAULT 'not_started',
    tebra_record_status TEXT NOT NULL DEFAULT 'not_sent',
    docusign_envelope_id TEXT,
    final_packet_path TEXT,
    delivery_date DATE,
    delivery_address TEXT,
    pod_recipient_name TEXT,
    pod_recipient_email TEXT,
    product_description TEXT,
    order_date_iso TEXT,
    dos_iso TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lite.docusign_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES lite.patients(id) ON DELETE CASCADE,
    envelope_id TEXT NOT NULL,
    template_name TEXT,
    recipient_name TEXT,
    recipient_email TEXT,
    status TEXT,
    sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    signed_document_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lite_docusign_events_order ON lite.docusign_events (order_id);
CREATE INDEX IF NOT EXISTS idx_lite_docusign_envelope ON lite.docusign_events (envelope_id);

CREATE TABLE IF NOT EXISTS lite.trident_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES lite.patients(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lite_trident_audit_order ON lite.trident_audit_log (order_id);

CREATE TABLE IF NOT EXISTS lite.tebra_handoff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES lite.patients(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


async def ensure_trident30_schema(conn: asyncpg.Connection) -> None:
    await conn.execute(WORKFLOW_DDL)


def _json_list(v: Any) -> list[str]:
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x) for x in v]
    if isinstance(v, str):
        try:
            p = json.loads(v)
            return [str(x) for x in p] if isinstance(p, list) else []
        except json.JSONDecodeError:
            return []
    return []


def row_patient(p: asyncpg.Record) -> dict[str, Any]:
    return {
        "id": str(p["id"]),
        "first_name": p["first_name"],
        "last_name": p["last_name"],
        "dob": p["dob"].isoformat() if p.get("dob") else None,
        "phone": p.get("phone"),
        "email": p.get("email"),
        "address": p.get("address"),
        "payer_name": p.get("payer_name"),
        "member_id": p.get("member_id"),
        "ordering_provider": p.get("ordering_provider"),
        "diagnosis_codes": _json_list(p.get("diagnosis_codes")),
        "hcpcs_codes": _json_list(p.get("hcpcs_codes")),
        "notes": p.get("notes"),
    }


def row_workflow(r: asyncpg.Record) -> dict[str, Any]:
    return {
        "coding_cover_sheet_status": r["coding_cover_sheet_status"],
        "pod_status": r["pod_status"],
        "final_packet_status": r["final_packet_status"],
        "tebra_record_status": r["tebra_record_status"],
        "docusign_envelope_id": r.get("docusign_envelope_id"),
        "final_packet_path": r.get("final_packet_path"),
        "delivery_date": r["delivery_date"].isoformat() if r.get("delivery_date") else None,
        "delivery_address": r.get("delivery_address"),
        "pod_recipient_name": r.get("pod_recipient_name"),
        "pod_recipient_email": r.get("pod_recipient_email"),
        "product_description": r.get("product_description"),
        "order_date_iso": r.get("order_date_iso"),
        "dos_iso": r.get("dos_iso"),
    }


def infer_queue_bucket(rule_hits: list[dict[str, Any]], workflow: dict[str, Any]) -> str:
    if any(x.get("blocking") for x in rule_hits):
        return "red"
    ccss = workflow.get("coding_cover_sheet_status", "not_started")
    fps = workflow.get("final_packet_status", "not_started")
    if ccss in ("generated", "approved") and fps in ("assembled", "saved_to_tebra"):
        return "green"
    return "yellow"


def build_rule_hits(p: dict[str, Any], upload_categories: set[str], has_coding_gen: bool) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []

    def add(rule: str, message: str, blocking: bool) -> None:
        hits.append(
            {
                "rule_name": rule,
                "message": message,
                "blocking": blocking,
                "severity": "blocking" if blocking else "warning",
            }
        )

    if not (p.get("first_name") or "").strip() or not (p.get("last_name") or "").strip():
        add("missing_patient_name", "Patient full name is required.", True)
    if not p.get("dob"):
        add("missing_dob", "DOB is required.", True)
    if not p.get("payer_name"):
        add("missing_payer", "Payer name is required for Tebra and coding cover.", False)
    if not p.get("member_id"):
        add("missing_member_id", "Member ID is required for billing entry.", False)
    if not p.get("ordering_provider"):
        add("missing_provider", "Ordering provider is required.", True)
    if not _json_list(p.get("diagnosis_codes")):
        add("missing_icd10", "At least one ICD-10 code is required.", True)
    if not _json_list(p.get("hcpcs_codes")):
        add("missing_hcpcs", "At least one HCPCS code is required for coding cover.", False)

    if "rx_order" not in upload_categories and "rx" not in upload_categories:
        add("missing_rx", "No Rx / order document classified; upload rx_order or rx.", False)
    if "chart_note" not in upload_categories and "medical_records" not in upload_categories:
        add("missing_chart", "No chart note classified; upload chart_note or medical_records.", False)

    if not has_coding_gen:
        add("cover_not_generated", "Coding cover sheet not generated yet.", False)
    return hits


def build_readiness(
    p: dict[str, Any], uploads: list[dict[str, Any]], generated_types: set[str]
) -> dict[str, Any]:
    cats = {u.get("category", "") for u in uploads}
    return {
        "has_demographics": bool(p.get("first_name") and p.get("last_name") and p.get("dob")),
        "has_payer": bool(p.get("payer_name") and p.get("member_id")),
        "has_provider": bool(p.get("ordering_provider")),
        "has_icd10": bool(_json_list(p.get("diagnosis_codes"))),
        "has_hcpcs": bool(_json_list(p.get("hcpcs_codes"))),
        "documents": {
            "rx_or_order": "rx_order" in cats or "rx" in cats,
            "facesheet": "facesheet" in cats,
            "insurance": "insurance_card_front" in cats
            or "insurance_card_back" in cats
            or "insurance" in cats,
            "chart_note": "chart_note" in cats or "medical_records" in cats,
            "swo": "swo" in cats,
            "payer_addendum": "payer_addendum" in cats,
            "delivery_tracking": "delivery_tracking" in cats,
        },
        "generated": {
            "coding_cover_sheet": "coding_cover_sheet" in generated_types,
            "pod_packet": "pod_packet" in generated_types,
            "final_packet": "final_packet" in generated_types,
        },
    }


def _modifiers_note(p: dict[str, Any]) -> str:
    n = p.get("notes") or ""
    m = re.search(r"modifier[s]?\s*[:#]?\s*([A-Z0-9,\s]+)", n, re.I)
    return m.group(1).strip() if m else "(none recorded)"


def generate_coding_cover_sheet_content(
    p: dict[str, Any],
    uploads: list[dict[str, Any]],
    generated: list[dict[str, Any]],
    at: datetime,
    wf: Optional[dict[str, Any]] = None,
) -> str:
    name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
    dx = ", ".join(_json_list(p.get("diagnosis_codes"))) or "(none)"
    hc = ", ".join(_json_list(p.get("hcpcs_codes"))) or "(none)"
    checklist = []
    for u in uploads:
        checklist.append(f"  [ ] {u.get('category')}: {u.get('filename')}")
    for g in generated:
        if g.get("document_type") not in ("coding_cover_sheet", "pod_packet", "final_packet"):
            checklist.append(f"  [ ] generated/{g.get('document_type')}")
    if not checklist:
        checklist = ["  (no source files yet)"]
    w = wf or {}
    odt = w.get("order_date_iso")
    dos = w.get("dos_iso")
    lines = [
        "TRIDENT 3.0 — CODING COVER SHEET (Tebra billing entry)",
        f"Generated (UTC): {at.strftime('%Y-%m-%d %H:%M')}",
        "",
        "PATIENT",
        f"  Full name: {name}",
        f"  DOB: {p.get('dob') or ''}",
        "",
        "PAYER",
        f"  Payer name: {p.get('payer_name') or '(not specified)'}",
        f"  Member ID: {p.get('member_id') or '(not specified)'}",
        "",
        "PROVIDER",
        f"  Ordering provider: {p.get('ordering_provider') or '(not specified)'}",
        "  NPI: (add to patient record / physician master when available)",
        "",
        "DATES",
        f"  Order date: {odt or '(not set — use workflow PATCH or notes)'}",
        f"  DOS: {dos or '(not set — use workflow PATCH or notes)'}",
        "",
        "LINE ITEMS",
        f"  Product / service: {w.get('product_description') or p.get('notes', '')[:200] or 'See order / Rx'}",
        f"  HCPCS: {hc}",
        f"  ICD-10: {dx}",
        f"  Modifiers (if applicable): {_modifiers_note(p)}",
        f"  Quantity: 1 (adjust per line item in Tebra as needed)",
        "",
        "BILLING NOTES",
        f"  {p.get('notes') or '(none)'}",
        "",
        "INCLUDED DOCS CHECKLIST (attach in Tebra patient support record as listed)",
        *checklist,
        "",
        "— End of coding cover sheet —",
    ]
    return "\n".join(lines)


def generate_pod_packet_content(
    p: dict[str, Any], wf: dict[str, Any], at: datetime
) -> str:
    name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
    prod = (
        wf.get("product_description")
        or "DME / product as specified on order (see support record)"
    )
    daddr = wf.get("delivery_address") or p.get("address") or "(delivery address TBD)"
    ddate = wf.get("delivery_date") or "(delivery date TBD — set in order workflow before send)"
    lines = [
        "TRIDENT 3.0 — PROOF OF DELIVERY (DocuSign-ready packet — plain text; upload PDF to DocuSign template)",
        f"Generated (UTC): {at.strftime('%Y-%m-%d %H:%M')}",
        "",
        "PATIENT",
        f"  {name}",
        "",
        "PRODUCT / DEVICE",
        f"  {prod}",
        "",
        "DELIVERY",
        f"  Delivery date: {ddate}",
        f"  Delivery address: {daddr}",
        "",
        "ACKNOWLEDGEMENT",
        "  I acknowledge receipt of the item(s) listed above in good, usable condition unless noted.",
        "",
        "CONDITION",
        "  I confirm the item(s) match my order, or I note a discrepancy: ________________",
        "",
        "SIGNATURE",
        "  Signature: _________________________  Printed name: ______________________",
        f"  Date/Time: ____________  (captured in DocuSign; server time recorded in audit log on completion)",
        "",
        "This packet is for patient signature in DocuSign; a signed copy is returned into the order for the final Tebra record.",
    ]
    return "\n".join(lines)


def generate_final_packet_content(
    p: dict[str, Any],
    uploads: list[dict[str, Any]],
    generated: list[dict[str, Any]],
    wf: dict[str, Any],
    at: datetime,
    has_signed_pod_upload: bool,
) -> str:
    name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
    sections: list[str] = [
        "TRIDENT 3.0 — FINAL PATIENT SUPPORT RECORD (Tebra / internal archive manifest)",
        f"Generated (UTC): {at.strftime('%Y-%m-%d %H:%M')}",
        f"Patient: {name}",
        "",
    ]
    by_cat: dict[str, list[str]] = {}
    for u in uploads:
        c = u.get("category", "other")
        by_cat.setdefault(c, []).append(f"  - {u.get('filename')} (upload)")
    sections.append("SOURCE DOCUMENTS")
    for cat, lines in sorted(by_cat.items()):
        sections.append(f"  [{cat}]")
        sections.extend(lines)
    sections.append("")
    sections.append("GENERATED / DERIVED")
    for g in generated:
        sections.append(
            f"  - {g.get('document_type')} (id: {g.get('id', '')[:8]}...)"
        )
    sections.append("")
    sections.append("COMPOSITION (per spec)")
    sections.append("  - Coding cover sheet: included in generated if coding_cover_sheet created")
    sections.append("  - Rx / order: look for doc class rx_order or rx in uploads")
    sections.append("  - Facesheet: look for facesheet in uploads")
    sections.append("  - Insurance cards: insurance_card_front / _back (or insurance)")
    sections.append("  - Chart note: chart_note / medical_records")
    sections.append("  - SWO: class swo (upload) or generated swo")
    sections.append("  - Payer addendum: payer_addendum if present")
    sections.append("  - Tracking / delivery: delivery_tracking if present")
    pod_state = "complete" if wf.get("pod_status") == "completed" and has_signed_pod_upload else "pending or N/A"
    sections.append(f"  - Signed POD: {pod_state} (envelope: {wf.get('docusign_envelope_id') or 'n/a'})")
    sections.append("  - Supporting: all other upload categories not listed")
    sections.append("")
    if wf.get("final_packet_path"):
        sections.append(f"Prior bundle file path: {wf['final_packet_path']}")
    return "\n".join(sections) + "\n"


async def log_audit(
    conn: asyncpg.Connection, order_id: uuid.UUID, action: str, details: dict[str, Any]
) -> None:
    await conn.execute(
        """
        INSERT INTO lite.trident_audit_log (order_id, action, details)
        VALUES ($1, $2, $3::jsonb)
        """,
        order_id,
        action,
        json.dumps(details or {}),
    )
