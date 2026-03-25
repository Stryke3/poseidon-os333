"""
POSEIDON EDI Service — 835 Remittance Advice Parser
Parses X12 835 ERA transactions into structured claim data.

Supports two modes:
1. Native X12 parsing (segment-by-segment CLP/CAS/SVC/NM1/DTM)
2. Stedi-assisted parsing (POST raw X12, get JSON back)

CARC/RARC classification feeds directly into Trident training pipeline.

Reference:
  CLP = Claim Payment Information
  CAS = Claim Adjustment Segment (CARC codes)
  SVC = Service Line (HCPCS + amounts)
  NM1 = Entity Name (patient, provider, payer)
  DTM = Date/Time Reference
  PLB = Provider Level Balance (adjustments)
  LQ  = Form Identification (RARC codes)
"""
import logging
import re
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

log = logging.getLogger("edi.parser_835")


# ─── CARC → Denial Category Mapping ─────────────────────────────────────────
# Groups the 300+ CARC codes into actionable denial categories for Trident
CARC_CATEGORIES = {
    # Eligibility / Coverage
    "1": "eligibility", "2": "eligibility", "27": "eligibility",
    "29": "timely_filing", "31": "eligibility", "96": "eligibility",
    "109": "eligibility", "170": "eligibility", "171": "eligibility",
    "197": "authorization",

    # Medical Necessity
    "50": "medical_necessity", "55": "medical_necessity",
    "56": "medical_necessity", "57": "medical_necessity",
    "58": "medical_necessity", "59": "medical_necessity",
    "151": "medical_necessity", "167": "medical_necessity",
    "208": "medical_necessity",

    # Authorization / Precertification
    "4": "authorization", "15": "authorization",
    "38": "authorization", "197": "authorization",

    # Coding / Bundling
    "5": "coding", "6": "coding", "11": "coding",
    "16": "coding", "97": "duplicate", "144": "coding",
    "146": "coding", "181": "coding", "182": "coding",
    "B7": "coding", "B15": "coding",

    # Timely Filing
    "29": "timely_filing", "119": "timely_filing",

    # Duplicate
    "18": "duplicate", "97": "duplicate",

    # Coordination of Benefits
    "22": "coordination", "23": "coordination", "24": "coordination",

    # Contractual Obligation (typically not appealable)
    "45": "contractual", "253": "contractual",

    # Patient Responsibility
    "1": "patient_responsibility", "2": "patient_responsibility",
    "3": "patient_responsibility",
}

# Suggested action per denial category
CATEGORY_ACTIONS = {
    "eligibility":          "verify_eligibility_resubmit",
    "medical_necessity":    "appeal_with_clinical_notes",
    "authorization":        "obtain_auth_resubmit",
    "coding":               "review_coding_resubmit",
    "timely_filing":        "appeal_with_proof_of_timely",
    "duplicate":            "verify_original_claim",
    "coordination":         "submit_to_secondary",
    "contractual":          "write_off",
    "patient_responsibility": "patient_bill",
}

# CAS adjustment group codes
ADJUSTMENT_GROUPS = {
    "CO": "Contractual Obligation",
    "CR": "Corrections and Reversals",
    "OA": "Other Adjustment",
    "PI": "Payor Initiated Reduction",
    "PR": "Patient Responsibility",
}


def classify_carc(carc_code: str) -> tuple:
    """Return (category, suggested_action, is_actionable) for a CARC code."""
    category = CARC_CATEGORIES.get(carc_code, "other")
    action = CATEGORY_ACTIONS.get(category, "manual_review")
    is_actionable = category not in ("contractual", "patient_responsibility")
    return category, action, is_actionable


def parse_835_x12(content: str) -> dict:
    """
    Parse raw X12 835 EDI content into structured data.

    Returns:
    {
        "header": {payer_name, check_number, check_date, total_paid, ...},
        "claims": [
            {
                "patient_control_number": "ORD00000123",
                "claim_status_code": "1",
                "billed_amount": 850.00,
                "paid_amount": 612.00,
                "patient_responsibility": 238.00,
                "payer_claim_number": "...",
                "patient": {first_name, last_name, member_id},
                "provider_npi": "...",
                "service_lines": [{hcpcs, billed, paid, allowed, ...}],
                "adjustments": [{group, carc, amount, category, action, ...}],
                "is_denial": false,
                "is_partial_pay": true,
            }
        ],
        "summary": {total_claims, total_paid, total_denied, total_billed}
    }
    """
    # Detect segment terminator (usually ~ but can vary)
    term = "~"
    if "~" not in content and "\n" in content:
        term = "\n"

    segments = [s.strip() for s in content.split(term) if s.strip()]

    header = {}
    claims = []
    current_claim = {}
    current_adjustments = []
    current_service_lines = []
    current_entity_context = None  # tracks which NM1 loop we're in

    for seg in segments:
        elements = seg.split("*")
        seg_id = elements[0].strip()

        # ── ISA: Interchange Header ──────────────────────────────────────
        if seg_id == "ISA" and len(elements) > 12:
            header["sender_id"] = elements[6].strip()
            header["receiver_id"] = elements[8].strip()
            header["interchange_date"] = elements[9]
            header["interchange_control_num"] = elements[13] if len(elements) > 13 else ""

        # ── GS: Functional Group ─────────────────────────────────────────
        elif seg_id == "GS" and len(elements) > 2:
            header["functional_id"] = elements[1]
            header["sender_code"] = elements[2]

        # ── BPR: Financial Information ───────────────────────────────────
        elif seg_id == "BPR" and len(elements) > 1:
            header["transaction_type"] = elements[1]
            if len(elements) > 2:
                header["total_paid"] = _safe_decimal(elements[2])
            if len(elements) > 16:
                header["check_date"] = _parse_date(elements[16])

        # ── TRN: Check/EFT Trace ─────────────────────────────────────────
        elif seg_id == "TRN" and len(elements) > 2:
            header["check_number"] = elements[2]

        # ── N1: Payer/Payee Identification ───────────────────────────────
        elif seg_id == "N1" and len(elements) > 2:
            if elements[1] == "PR":  # Payer
                header["payer_name"] = elements[2]
                if len(elements) > 4:
                    header["payer_id_code"] = elements[4]

        # ── CLP: Claim Payment ───────────────────────────────────────────
        elif seg_id == "CLP":
            # Save previous claim
            if current_claim:
                current_claim["adjustments"] = current_adjustments
                current_claim["service_lines"] = current_service_lines
                _classify_claim(current_claim)
                claims.append(current_claim)

            current_claim = {
                "patient_control_number": elements[1] if len(elements) > 1 else "",
                "claim_status_code": elements[2] if len(elements) > 2 else "",
                "billed_amount": _safe_decimal(elements[3]) if len(elements) > 3 else Decimal(0),
                "paid_amount": _safe_decimal(elements[4]) if len(elements) > 4 else Decimal(0),
                "patient_responsibility": _safe_decimal(elements[5]) if len(elements) > 5 else Decimal(0),
                "filing_indicator": elements[6] if len(elements) > 6 else "",
                "payer_claim_number": elements[7] if len(elements) > 7 else "",
                "patient": {},
                "provider_npi": "",
                "service_date_start": None,
                "service_date_end": None,
            }
            current_adjustments = []
            current_service_lines = []

        # ── CAS: Claim Adjustment ────────────────────────────────────────
        elif seg_id == "CAS" and len(elements) > 1 and current_claim:
            adj_group = elements[1]
            # CAS segments have triplets: CARC, amount, quantity
            i = 2
            while i + 1 < len(elements):
                carc = elements[i].strip() if i < len(elements) else ""
                amount = _safe_decimal(elements[i + 1]) if i + 1 < len(elements) else Decimal(0)
                quantity = int(elements[i + 2]) if i + 2 < len(elements) and elements[i + 2].strip() else None

                if carc:
                    category, action, is_actionable = classify_carc(carc)
                    current_adjustments.append({
                        "adjustment_group": adj_group,
                        "adjustment_group_name": ADJUSTMENT_GROUPS.get(adj_group, adj_group),
                        "carc_code": carc,
                        "adjustment_amount": float(amount),
                        "adjustment_quantity": quantity,
                        "denial_category": category,
                        "suggested_action": action,
                        "is_actionable": is_actionable,
                    })
                i += 3

        # ── NM1: Entity Name ─────────────────────────────────────────────
        elif seg_id == "NM1" and len(elements) > 3 and current_claim:
            entity_type = elements[1]
            if entity_type == "QC":  # Patient
                current_claim["patient"] = {
                    "last_name": elements[3] if len(elements) > 3 else "",
                    "first_name": elements[4] if len(elements) > 4 else "",
                    "member_id": elements[9] if len(elements) > 9 else "",
                }
            elif entity_type == "82":  # Rendering Provider
                current_claim["provider_npi"] = elements[9] if len(elements) > 9 else ""
            elif entity_type == "TT":  # Crossover Carrier
                current_claim["crossover_payer"] = elements[3] if len(elements) > 3 else ""

        # ── DTM: Date Reference ──────────────────────────────────────────
        elif seg_id == "DTM" and len(elements) > 2 and current_claim:
            qualifier = elements[1]
            if qualifier == "232":  # Claim statement period start
                current_claim["service_date_start"] = _parse_date(elements[2])
            elif qualifier == "233":  # Claim statement period end
                current_claim["service_date_end"] = _parse_date(elements[2])
            elif qualifier == "050":  # Received date
                current_claim["received_date"] = _parse_date(elements[2])

        # ── SVC: Service Line ────────────────────────────────────────────
        elif seg_id == "SVC" and len(elements) > 1 and current_claim:
            procedure_info = elements[1].split(":") if ":" in elements[1] else [elements[1]]
            hcpcs = procedure_info[1] if len(procedure_info) > 1 else procedure_info[0]
            modifier = procedure_info[2] if len(procedure_info) > 2 else None

            svc = {
                "hcpcs_code": hcpcs,
                "modifier": modifier,
                "billed_amount": _safe_decimal(elements[2]) if len(elements) > 2 else Decimal(0),
                "paid_amount": _safe_decimal(elements[3]) if len(elements) > 3 else Decimal(0),
                "units_billed": int(elements[5]) if len(elements) > 5 and elements[5].strip() else 1,
                "units_paid": int(elements[7]) if len(elements) > 7 and elements[7].strip() else None,
            }

            # Check for allowed amount in subsequent AMT segment (captured next iteration)
            current_service_lines.append(svc)

        # ── AMT: Monetary Amount ─────────────────────────────────────────
        elif seg_id == "AMT" and len(elements) > 2 and current_service_lines:
            qualifier = elements[1]
            amount = _safe_decimal(elements[2])
            last_svc = current_service_lines[-1]
            if qualifier == "B6":  # Allowed
                last_svc["allowed_amount"] = float(amount)
            elif qualifier == "KH":  # Deductible
                last_svc["deductible"] = float(amount)
            elif qualifier == "T":  # Tax
                last_svc["tax"] = float(amount)

        # ── LQ: RARC (Remark) Codes ──────────────────────────────────────
        elif seg_id == "LQ" and len(elements) > 2:
            if elements[1] == "HE" and current_adjustments:
                # Attach RARC to most recent adjustment
                current_adjustments[-1]["rarc_code"] = elements[2]

    # Save last claim
    if current_claim:
        current_claim["adjustments"] = current_adjustments
        current_claim["service_lines"] = current_service_lines
        _classify_claim(current_claim)
        claims.append(current_claim)

    # ── Summary ──────────────────────────────────────────────────────────
    total_billed = sum(float(c.get("billed_amount", 0)) for c in claims)
    total_paid = sum(float(c.get("paid_amount", 0)) for c in claims)
    denials = [c for c in claims if c.get("is_denial")]
    partial_pays = [c for c in claims if c.get("is_partial_pay")]

    return {
        "header": header,
        "claims": claims,
        "summary": {
            "total_claims": len(claims),
            "total_billed": total_billed,
            "total_paid": total_paid,
            "total_denied": len(denials),
            "total_partial_pay": len(partial_pays),
            "total_adjustments": sum(len(c.get("adjustments", [])) for c in claims),
            "denial_rate": round(len(denials) / len(claims) * 100, 1) if claims else 0,
            "net_collection_rate": round(total_paid / total_billed * 100, 1) if total_billed else 0,
        },
        "parsed_at": datetime.utcnow().isoformat(),
    }


def _classify_claim(claim: dict):
    """Classify claim as denial, partial pay, or full pay."""
    paid = float(claim.get("paid_amount", 0))
    billed = float(claim.get("billed_amount", 0))
    status = claim.get("claim_status_code", "")

    claim["is_denial"] = paid == 0 and billed > 0
    claim["is_partial_pay"] = 0 < paid < billed
    claim["is_reversal"] = status == "22"

    # If denied, find primary denial reason
    if claim["is_denial"] and claim.get("adjustments"):
        actionable = [a for a in claim["adjustments"] if a.get("is_actionable")]
        if actionable:
            claim["primary_denial_category"] = actionable[0]["denial_category"]
            claim["primary_denial_action"] = actionable[0]["suggested_action"]


def _safe_decimal(val: str) -> Decimal:
    try:
        return Decimal(val.strip()) if val and val.strip() else Decimal(0)
    except Exception:
        return Decimal(0)


def _parse_date(val: str) -> Optional[str]:
    """Parse CCYYMMDD date string to ISO format."""
    val = (val or "").strip()
    if len(val) == 8 and val.isdigit():
        return f"{val[:4]}-{val[4:6]}-{val[6:8]}"
    return val if val else None
