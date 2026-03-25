"""
POSEIDON EDI Service — 837P Claim Builder
Constructs Stedi Healthcare API-compatible JSON from PostgreSQL order data.
Maps POSEIDON canonical schema → ASC X12 837P Professional structure.

Loop structure:
  ISA → GS → ST
    1000A: Submitter (billing entity)
    1000B: Receiver (clearinghouse/payer)
    2000A: Billing Provider
      2010AA: Billing Provider Name/Address
      2010AB: Pay-to Address (if different)
    2000B: Subscriber
      2010BA: Subscriber Name
      2010BB: Payer Name
      2300: Claim Information
        2310B: Rendering Provider (if different from billing)
        2310D: Referring Provider (ordering physician)
        2400: Service Lines
  SE → GE → IEA
"""
import json
import os
import logging
from datetime import date, datetime
from typing import Optional

import asyncpg

from app.database import clean_nones

log = logging.getLogger("edi.builder_837p")

# ISA envelope config — clearinghouse assigns these during enrollment
ISA_SENDER_ID     = os.environ.get("ISA_SENDER_ID", "AV09311993     ")  # 15 chars
ISA_RECEIVER_ID   = os.environ.get("ISA_RECEIVER_ID", "030240928      ")  # 15 chars
ISA_SENDER_QUAL   = os.getenv("ISA_SENDER_QUAL", "ZZ")
ISA_RECEIVER_QUAL = os.getenv("ISA_RECEIVER_QUAL", "01")

# Billing provider identity — env fallback when org record is incomplete
BILLING_NPI      = os.getenv("BILLING_NPI", "")
BILLING_TAX_ID   = os.getenv("BILLING_TAX_ID", "")
BILLING_ORG_NAME = os.getenv("BILLING_ORG_NAME", "")
BILLING_TAXONOMY = os.getenv("BILLING_TAXONOMY", "332B00000X")
BILLING_PHONE    = os.getenv("BILLING_PHONE", "")
BILLING_ADDR     = os.getenv("BILLING_ADDR", "")
BILLING_CITY     = os.getenv("BILLING_CITY", "")
BILLING_STATE    = os.getenv("BILLING_STATE", "")
BILLING_ZIP      = os.getenv("BILLING_ZIP", "")

# Claim filing indicator codes by payer type
FILING_CODES = {
    "medicare":   "MA",  # Medicare Part A
    "medicare_b": "MB",  # Medicare Part B
    "medicaid":   "MC",
    "tricare":    "CH",  # CHAMPUS
    "commercial": "CI",
    "bcbs":       "BL",
    "hmo":        "HM",
    "workers_comp": "WC",
    "auto":       "AM",
    "other":      "CI",
}


async def fetch_claim_data(order_id, conn: asyncpg.Connection) -> tuple:
    """
    Pull all data needed to build 837P from PostgreSQL.
    Adapted for POSEIDON canonical schema (UUID PKs, JSONB fields).
    """
    order = await conn.fetchrow("""
        SELECT
            o.id, o.patient_id, o.org_id, o.payer_id,
            o.hcpcs_codes, o.total_billed, o.date_of_service,
            o.physician_id, o.place_of_service,
            o.prior_auth_number, o.npi_billing, o.modifier,
            o.insurance_auth_number, o.referring_physician_npi,

            -- Patient
            p.first_name, p.last_name, p.dob, p.date_of_birth, p.gender,
            p.address_line1, p.city, p.state, p.zip_code,

            -- Primary insurance (from patient_insurances)
            pi.member_id AS insurance_member_id,
            pi.group_number AS insurance_group_number,
            pi.payer_name AS ins_payer_name,
            pi.payer_id AS ins_payer_id,

            -- Organization (billing provider)
            org.name AS org_name, org.npi AS org_npi, org.tax_id,
            org.billing_address AS org_billing_address,

            -- Payer (from payer_rules if exists)
            pr.payer_name AS payer_rule_name,

            -- Ordering Physician
            ph.first_name AS ph_first, ph.last_name AS ph_last,
            ph.npi AS ph_npi, ph.specialty AS ph_specialty

        FROM orders o
        JOIN patients p        ON p.id = o.patient_id
        LEFT JOIN patient_insurances pi ON pi.patient_id = p.id AND pi.is_primary = TRUE
        JOIN organizations org ON org.id = o.org_id
        LEFT JOIN payer_rules pr ON pr.id::TEXT = o.payer_id
        LEFT JOIN physicians ph ON ph.id = o.physician_id
        WHERE o.id = $1
    """, order_id)

    if not order:
        raise ValueError(f"Order {order_id} not found")

    diags = await conn.fetch(
        "SELECT icd10_code, sequence FROM order_diagnoses WHERE order_id=$1 ORDER BY sequence",
        order_id,
    )
    lines = await conn.fetch(
        """SELECT hcpcs_code, modifier, quantity AS units,
                  billed_amount AS charge_amount, NULL AS dos_start, NULL AS dos_end,
                  NULL AS diagnosis_pointers, NULL AS place_of_service, NULL AS rendering_npi
           FROM order_line_items WHERE order_id=$1 ORDER BY hcpcs_code""",
        order_id,
    )

    return dict(order), [dict(d) for d in diags], [dict(l) for l in lines]


def _filing_code(payer_type: Optional[str]) -> str:
    if not payer_type:
        return "CI"
    return FILING_CODES.get(payer_type.lower(), "CI")


def _fmt_date(d) -> str:
    if isinstance(d, (date, datetime)):
        return d.strftime("%Y%m%d")
    return str(d) if d else date.today().strftime("%Y%m%d")


def _gender_code(g: Optional[str]) -> str:
    if not g:
        return "U"
    return g[0].upper() if g[0].upper() in ("M", "F") else "U"


def _extract_billing_address(org_billing_address) -> dict:
    """Extract address fields from org.billing_address JSONB."""
    if not org_billing_address:
        return {}
    if isinstance(org_billing_address, str):
        try:
            org_billing_address = json.loads(org_billing_address)
        except (json.JSONDecodeError, TypeError):
            return {}
    return org_billing_address if isinstance(org_billing_address, dict) else {}


def _get_first_hcpcs(hcpcs_codes) -> Optional[str]:
    """Extract first HCPCS code from JSONB array."""
    if not hcpcs_codes:
        return None
    if isinstance(hcpcs_codes, str):
        try:
            hcpcs_codes = json.loads(hcpcs_codes)
        except (json.JSONDecodeError, TypeError):
            return None
    if isinstance(hcpcs_codes, list) and hcpcs_codes:
        return str(hcpcs_codes[0]).strip().upper()
    return None


def build_837p_payload(order: dict, diags: list, lines: list, icn: str) -> dict:
    """
    Build Stedi-compatible 837P JSON.
    Stedi's Healthcare API accepts structured JSON and handles
    X12 serialization + clearinghouse routing internally.
    """
    dos = _fmt_date(order.get("date_of_service"))
    billing_addr = _extract_billing_address(order.get("org_billing_address"))
    patient_dob = order.get("dob") or order.get("date_of_birth")

    # ── Service Lines ────────────────────────────────────────────────────
    service_lines = []
    if lines:
        for i, line in enumerate(lines, 1):
            sl = {
                "assignedNumber": str(i),
                "serviceDate": _fmt_date(line.get("dos_start") or order.get("date_of_service")),
                "serviceDateEnd": _fmt_date(line.get("dos_end") or line.get("dos_start") or order.get("date_of_service")),
                "professionalService": {
                    "procedureIdentifier": "HC",
                    "procedureCode": line["hcpcs_code"],
                    "procedureModifiers": [m.strip() for m in (line.get("modifier") or "").split(",") if m.strip()] or None,
                    "lineItemChargeAmount": str(line.get("charge_amount") or order.get("total_billed") or "0"),
                    "measurementUnit": "UN",
                    "serviceUnitCount": str(line.get("units", 1) or 1),
                    "placeOfServiceCode": str(line.get("place_of_service") or order.get("place_of_service", "12")),
                    "diagnosisCodePointers": _parse_diag_pointers(line.get("diagnosis_pointers"), len(diags)),
                },
            }
            if order.get("prior_auth_number") or order.get("insurance_auth_number"):
                sl["priorAuthorizationNumber"] = order.get("prior_auth_number") or order["insurance_auth_number"]

            service_lines.append(sl)
    else:
        # Single line from order header HCPCS
        hcpcs = _get_first_hcpcs(order.get("hcpcs_codes"))
        if not hcpcs:
            hcpcs = "99999"  # placeholder — validation should catch this
        service_lines = [{
            "assignedNumber": "1",
            "serviceDate": dos,
            "serviceDateEnd": dos,
            "professionalService": {
                "procedureIdentifier": "HC",
                "procedureCode": hcpcs,
                "procedureModifiers": [m.strip() for m in (order.get("modifier") or "").split(",") if m.strip()] or None,
                "lineItemChargeAmount": str(order.get("total_billed") or "0"),
                "measurementUnit": "UN",
                "serviceUnitCount": "1",
                "placeOfServiceCode": str(order.get("place_of_service", "12")),
                "diagnosisCodePointers": ["1"] if diags else [],
            },
        }]
        auth = order.get("prior_auth_number") or order.get("insurance_auth_number")
        if auth:
            service_lines[0]["priorAuthorizationNumber"] = auth

    # ── Total charge ─────────────────────────────────────────────────────
    if lines:
        total_charge = sum(float(l.get("charge_amount") or 0) for l in lines)
    else:
        total_charge = float(order.get("total_billed") or 0)

    # ── Diagnosis codes ──────────────────────────────────────────────────
    diagnosis_codes = []
    for i, d in enumerate(diags[:12]):  # max 12 per claim
        diagnosis_codes.append({
            "diagnosisTypeCode": "ABK" if i == 0 else "ABF",
            "diagnosisCode": d["icd10_code"].replace(".", ""),
        })

    # ── Payer name resolution ────────────────────────────────────────────
    payer_name = (
        order.get("payer_rule_name")
        or order.get("ins_payer_name")
        or "UNKNOWN PAYER"
    )
    payer_code = order.get("ins_payer_id") or order.get("payer_id") or ""

    # ── Build full payload ───────────────────────────────────────────────
    payload = {
        "controlNumber": icn,
        "tradingPartnerServiceId": payer_code,
        "submitter": {
            "organizationName": order.get("org_name") or BILLING_ORG_NAME,
            "contactInformation": {
                "name": order.get("org_name") or BILLING_ORG_NAME,
                "phoneNumber": BILLING_PHONE or "0000000000",
            },
        },
        "receiver": {
            "organizationName": payer_name,
        },
        "subscriber": {
            "memberId": order.get("insurance_member_id") or "",
            "paymentResponsibilityLevelCode": "P",
            "firstName": order["first_name"],
            "lastName": order["last_name"],
            "gender": _gender_code(order.get("gender")),
            "dateOfBirth": _fmt_date(patient_dob),
            "groupNumber": order.get("insurance_group_number"),
            "address": {
                "address1": order.get("address_line1") or "",
                "city": order.get("city") or "",
                "state": order.get("state") or "",
                "postalCode": (order.get("zip_code") or "")[:5],
            },
        },
        "billing": {
            "providerType": "billingProvider",
            "npi": order.get("npi_billing") or order.get("org_npi") or BILLING_NPI,
            "taxId": (order.get("tax_id") or BILLING_TAX_ID).replace("-", ""),
            "taxonomy": BILLING_TAXONOMY,
            "organizationName": order.get("org_name") or BILLING_ORG_NAME,
            "address": {
                "address1": billing_addr.get("address1") or billing_addr.get("street") or BILLING_ADDR,
                "city": billing_addr.get("city") or BILLING_CITY,
                "state": billing_addr.get("state") or BILLING_STATE,
                "postalCode": (billing_addr.get("zip") or billing_addr.get("postalCode") or BILLING_ZIP)[:5],
            },
        },
        "claimInformation": {
            "patientControlNumber": f"ORD-{str(order['id'])[:8].upper()}",
            "claimChargeAmount": f"{total_charge:.2f}",
            "placeOfServiceCode": str(order.get("place_of_service", "12")),
            "claimFrequencyCode": "1",  # original claim
            "signatureIndicator": "Y",
            "planParticipationCode": "A",  # assigned
            "benefitsAssignmentCertificationIndicator": "Y",
            "releaseOfInformationCode": "Y",
            "claimFilingCode": "CI",  # default commercial
        },
        "diagnosisCodes": diagnosis_codes,
        "serviceLines": service_lines,
    }

    # ── Referring/Ordering Provider (Loop 2310D) ─────────────────────────
    if order.get("ph_npi"):
        payload["referring"] = {
            "providerType": "referringProvider",
            "npi": order["ph_npi"],
            "firstName": order.get("ph_first") or "",
            "lastName": order.get("ph_last") or "",
        }
    elif order.get("referring_physician_npi"):
        payload["referring"] = {
            "providerType": "referringProvider",
            "npi": order["referring_physician_npi"],
        }

    # ── Prior Auth at claim level ────────────────────────────────────────
    auth = order.get("prior_auth_number") or order.get("insurance_auth_number")
    if auth:
        payload["claimInformation"]["priorAuthorizationNumber"] = auth

    return clean_nones(payload)


def _parse_diag_pointers(pointers_str: Optional[str], max_diags: int) -> list:
    """Parse '1,2,3' diagnosis pointer string into list."""
    if not pointers_str:
        return ["1"] if max_diags > 0 else []
    return [p.strip() for p in str(pointers_str).split(",") if p.strip()]
