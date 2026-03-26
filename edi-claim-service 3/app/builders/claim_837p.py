"""
POSEIDON EDI Service — 837P Claim Builder
Constructs Stedi Healthcare API-compatible JSON from PostgreSQL order data.
Maps POSEIDON schema → ASC X12 837P Professional structure.

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
import os
import logging
from datetime import date, datetime
from typing import Optional

import asyncpg

from app.database import clean_nones

log = logging.getLogger("edi.builder_837p")

# ISA envelope config — clearinghouse assigns these during enrollment
ISA_SENDER_ID     = os.environ.get("ISA_SENDER_ID", "STRYKEFOX      ")  # 15 chars
ISA_RECEIVER_ID   = os.environ.get("ISA_RECEIVER_ID", "030240928      ")  # 15 chars
ISA_SENDER_QUAL   = os.getenv("ISA_SENDER_QUAL", "ZZ")
ISA_RECEIVER_QUAL = os.getenv("ISA_RECEIVER_QUAL", "ZZ")

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


async def fetch_claim_data(order_id: int, conn: asyncpg.Connection) -> tuple:
    """
    Pull all data needed to build 837P from PostgreSQL.
    Single query with JOINs to minimize round trips.
    """
    order = await conn.fetchrow("""
        SELECT
            o.id, o.patient_id, o.org_id, o.payer_id,
            o.hcpcs_code, o.billed_amount, o.dos_start, o.dos_end,
            o.ordering_physician_id, o.place_of_service,
            o.prior_auth_number, o.npi_billing, o.modifier,

            -- Patient
            p.first_name, p.last_name, p.dob, p.gender,
            p.address1, p.city, p.state, p.zip,
            p.insurance_member_id, p.insurance_group_number,

            -- Organization (billing provider)
            org.name AS org_name, org.billing_npi, org.tax_id,
            org.address1 AS org_address, org.city AS org_city,
            org.state AS org_state, org.zip AS org_zip,
            org.phone AS org_phone, org.taxonomy_code,

            -- Payer
            py.name AS payer_name, py.payer_id AS payer_code,
            py.claims_address, py.claims_city,
            py.claims_state, py.claims_zip,
            py.payer_type,

            -- Ordering Physician
            ph.first_name AS ph_first, ph.last_name AS ph_last,
            ph.npi AS ph_npi, ph.taxonomy_code AS ph_taxonomy

        FROM orders o
        JOIN patients p        ON p.id = o.patient_id
        JOIN organizations org ON org.id = o.org_id
        LEFT JOIN payers py    ON py.id = o.payer_id
        LEFT JOIN physicians ph ON ph.id = o.ordering_physician_id
        WHERE o.id = $1
    """, order_id)

    if not order:
        raise ValueError(f"Order {order_id} not found")

    diags = await conn.fetch(
        "SELECT icd10_code, sequence FROM order_diagnoses WHERE order_id=$1 ORDER BY sequence",
        order_id,
    )
    lines = await conn.fetch(
        """SELECT hcpcs_code, modifier, units, charge_amount, dos_start, dos_end,
                  diagnosis_pointers, place_of_service, rendering_npi
           FROM order_line_items WHERE order_id=$1 ORDER BY line_number""",
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


def build_837p_payload(order: dict, diags: list, lines: list, icn: str) -> dict:
    """
    Build Stedi-compatible 837P JSON.
    Stedi's Healthcare API accepts structured JSON and handles
    X12 serialization + clearinghouse routing internally.
    """
    today = date.today().strftime("%Y%m%d")
    now_time = datetime.utcnow().strftime("%H%M")
    dos_start = _fmt_date(order.get("dos_start"))
    dos_end = _fmt_date(order.get("dos_end") or order.get("dos_start"))

    # ── Service Lines ────────────────────────────────────────────────────
    service_lines = []
    if lines:
        for i, line in enumerate(lines, 1):
            sl = {
                "assignedNumber": str(i),
                "serviceDate": _fmt_date(line.get("dos_start") or order.get("dos_start")),
                "serviceDateEnd": _fmt_date(line.get("dos_end") or line.get("dos_start") or order.get("dos_start")),
                "professionalService": {
                    "procedureIdentifier": "HC",
                    "procedureCode": line["hcpcs_code"],
                    "procedureModifiers": [m.strip() for m in (line.get("modifier") or "").split(",") if m.strip()] or None,
                    "lineItemChargeAmount": str(line.get("charge_amount", order.get("billed_amount", "0"))),
                    "measurementUnit": "UN",
                    "serviceUnitCount": str(line.get("units", 1)),
                    "placeOfServiceCode": str(line.get("place_of_service") or order.get("place_of_service", "12")),
                    "diagnosisCodePointers": _parse_diag_pointers(line.get("diagnosis_pointers"), len(diags)),
                },
            }
            # Prior auth at line level
            if order.get("prior_auth_number"):
                sl["priorAuthorizationNumber"] = order["prior_auth_number"]

            # Rendering provider if different from billing
            rnpi = line.get("rendering_npi")
            if rnpi and rnpi != order.get("billing_npi"):
                sl["renderingProvider"] = {
                    "npi": rnpi,
                }

            service_lines.append(sl)
    else:
        # Single line from order header
        service_lines = [{
            "assignedNumber": "1",
            "serviceDate": dos_start,
            "serviceDateEnd": dos_end,
            "professionalService": {
                "procedureIdentifier": "HC",
                "procedureCode": order["hcpcs_code"],
                "procedureModifiers": [m.strip() for m in (order.get("modifier") or "").split(",") if m.strip()] or None,
                "lineItemChargeAmount": str(order.get("billed_amount", "0")),
                "measurementUnit": "UN",
                "serviceUnitCount": "1",
                "placeOfServiceCode": str(order.get("place_of_service", "12")),
                "diagnosisCodePointers": ["1"] if diags else [],
            },
        }]
        if order.get("prior_auth_number"):
            service_lines[0]["priorAuthorizationNumber"] = order["prior_auth_number"]

    # ── Total charge ─────────────────────────────────────────────────────
    if lines:
        total_charge = sum(float(l.get("charge_amount", 0)) for l in lines)
    else:
        total_charge = float(order.get("billed_amount", 0))

    # ── Diagnosis codes ──────────────────────────────────────────────────
    diagnosis_codes = []
    for i, d in enumerate(diags[:12]):  # max 12 per claim
        diagnosis_codes.append({
            "diagnosisTypeCode": "ABK" if i == 0 else "ABF",
            "diagnosisCode": d["icd10_code"].replace(".", ""),
        })

    # ── Build full payload ───────────────────────────────────────────────
    payload = {
        "controlNumber": icn,
        "tradingPartnerServiceId": order.get("payer_code", ""),
        "submitter": {
            "organizationName": order["org_name"],
            "contactInformation": {
                "name": order["org_name"],
                "phoneNumber": (order.get("org_phone") or "0000000000").replace("-", "").replace(" ", "")[:10],
            },
        },
        "receiver": {
            "organizationName": order.get("payer_name", "UNKNOWN PAYER"),
        },
        "subscriber": {
            "memberId": order.get("insurance_member_id", ""),
            "paymentResponsibilityLevelCode": "P",
            "firstName": order["first_name"],
            "lastName": order["last_name"],
            "gender": _gender_code(order.get("gender")),
            "dateOfBirth": _fmt_date(order.get("dob")),
            "groupNumber": order.get("insurance_group_number"),
            "address": {
                "address1": order.get("address1", ""),
                "city": order.get("city", ""),
                "state": order.get("state", ""),
                "postalCode": (order.get("zip") or "")[:5],
            },
        },
        "billing": {
            "providerType": "billingProvider",
            "npi": order.get("billing_npi", ""),
            "taxId": (order.get("tax_id") or "").replace("-", ""),
            "taxonomy": order.get("taxonomy_code", "332B00000X"),  # DME supplier default
            "organizationName": order["org_name"],
            "address": {
                "address1": order.get("org_address", ""),
                "city": order.get("org_city", ""),
                "state": order.get("org_state", ""),
                "postalCode": (order.get("org_zip") or "")[:5],
            },
        },
        "claimInformation": {
            "patientControlNumber": f"ORD{order['id']:08d}",
            "claimChargeAmount": f"{total_charge:.2f}",
            "placeOfServiceCode": str(order.get("place_of_service", "12")),
            "claimFrequencyCode": "1",  # original claim
            "signatureIndicator": "Y",
            "planParticipationCode": "A",  # assigned
            "benefitsAssignmentCertificationIndicator": "Y",
            "releaseOfInformationCode": "Y",
            "claimFilingCode": _filing_code(order.get("payer_type")),
        },
        "diagnosisCodes": diagnosis_codes,
        "serviceLines": service_lines,
    }

    # ── Referring/Ordering Provider (Loop 2310D) ─────────────────────────
    if order.get("ph_npi"):
        payload["referring"] = {
            "providerType": "referringProvider",
            "npi": order["ph_npi"],
            "firstName": order.get("ph_first", ""),
            "lastName": order.get("ph_last", ""),
            "taxonomy": order.get("ph_taxonomy"),
        }

    # ── Prior Auth at claim level ────────────────────────────────────────
    if order.get("prior_auth_number"):
        payload["claimInformation"]["priorAuthorizationNumber"] = order["prior_auth_number"]

    return clean_nones(payload)


def _parse_diag_pointers(pointers_str: Optional[str], max_diags: int) -> list:
    """Parse '1,2,3' diagnosis pointer string into list."""
    if not pointers_str:
        return ["1"] if max_diags > 0 else []
    return [p.strip() for p in str(pointers_str).split(",") if p.strip()]
