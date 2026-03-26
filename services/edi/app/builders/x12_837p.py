"""
POSEIDON EDI Service — Raw X12 837P Generator
Builds valid ASC X12 005010 837P transaction strings for SFTP submission to Availity.

ISA/GS envelope values per Availity Batch EDI Companion Guide v.20251124:
  ISA05 = ZZ (mutually defined) or 01 (DUNS)
  ISA06 = AV09311993 + 5 spaces (Availity-assigned sender ID)
  ISA07 = 01 (DUNS)
  ISA08 = 030240928 + 6 spaces (Availity receiver ID)
  ISA12 = 00501
  ISA15 = P (production) or T (test)
  GS01  = HC (Health Care Claim)
  GS02  = Customer ID (2618273 for StrykeFox Medical)
  GS03  = 030240928 (Availity)
"""
import os
from datetime import date, datetime
from typing import Optional

# Availity-specific envelope values (from EDI Companion Guide)
ISA_SENDER_QUAL    = os.getenv("ISA_SENDER_QUAL", "ZZ")
ISA_SENDER_ID      = os.getenv("ISA_SENDER_ID", "AV09311993     ")      # 15 chars padded
ISA_RECEIVER_QUAL  = os.getenv("ISA_RECEIVER_QUAL", "01")               # DUNS
ISA_RECEIVER_ID    = os.getenv("ISA_RECEIVER_ID", "030240928      ")     # 15 chars padded
AVAILITY_CUSTOMER_ID = os.getenv("AVAILITY_CUSTOMER_ID", "2618273")      # GS02
ISA_TEST_INDICATOR = os.getenv("ISA_TEST_INDICATOR", "P")                # P=prod, T=test

# StrykeFox Medical billing info
BILLING_NPI        = os.getenv("BILLING_NPI", "1821959420")
BILLING_TAX_ID     = os.getenv("BILLING_TAX_ID", "393429726")
BILLING_ORG_NAME   = os.getenv("BILLING_ORG_NAME", "STRYKEFOX MEDICAL")
BILLING_ADDR       = os.getenv("BILLING_ADDR", "9225 W CHARLESTON BLVD STE 2134")
BILLING_CITY       = os.getenv("BILLING_CITY", "LAS VEGAS")
BILLING_STATE      = os.getenv("BILLING_STATE", "NV")
BILLING_ZIP        = os.getenv("BILLING_ZIP", "89117")
BILLING_TAXONOMY   = os.getenv("BILLING_TAXONOMY", "332B00000X")
BILLING_PHONE      = os.getenv("BILLING_PHONE", "6124996561")

# Delimiters (Availity standard)
SEP = "*"       # element separator
SUB = ":"       # sub-element separator
TERM = "~"      # segment terminator
REP = "^"       # repetition separator


def generate_837p(order: dict, diags: list, lines: list, icn: str) -> str:
    """
    Generate a complete X12 005010 837P transaction string.

    Args:
        order: dict from fetch_claim_data (joined order/patient/org/payer/physician)
        diags: list of {icd10_code, sequence} dicts
        lines: list of {hcpcs_code, modifier, units, charge_amount, ...} dicts
        icn: 9-digit interchange control number

    Returns:
        Complete X12 string ready for SFTP upload to Availity
    """
    segments = []
    now = datetime.utcnow()
    today = date.today()

    # -- ISA: Interchange Control Header ---
    segments.append(
        f"ISA{SEP}00{SEP}          {SEP}00{SEP}          {SEP}"
        f"{_pad(ISA_SENDER_QUAL, 2)}{SEP}{_pad(ISA_SENDER_ID, 15)}{SEP}"
        f"{_pad(ISA_RECEIVER_QUAL, 2)}{SEP}{_pad(ISA_RECEIVER_ID, 15)}{SEP}"
        f"{now.strftime('%y%m%d')}{SEP}{now.strftime('%H%M')}{SEP}"
        f"{REP}{SEP}00501{SEP}{_pad(icn, 9, '0')}{SEP}0{SEP}"
        f"{ISA_TEST_INDICATOR}{SEP}{SUB}"
    )

    # -- GS: Functional Group Header ---
    gs_control = icn  # use same as ISA for simplicity
    segments.append(
        f"GS{SEP}HC{SEP}{AVAILITY_CUSTOMER_ID}{SEP}030240928{SEP}"
        f"{now.strftime('%Y%m%d')}{SEP}{now.strftime('%H%M')}{SEP}"
        f"{gs_control}{SEP}X{SEP}005010X222A1"
    )

    # -- ST: Transaction Set Header ---
    st_control = "0001"
    segments.append(f"ST{SEP}837{SEP}{st_control}{SEP}005010X222A1")

    # -- BHT: Beginning of Hierarchical Transaction ---
    bht_ref = f"ORD-{str(order['id'])[:8].upper()}"
    segments.append(
        f"BHT{SEP}0019{SEP}00{SEP}{bht_ref}{SEP}"
        f"{today.strftime('%Y%m%d')}{SEP}{now.strftime('%H%M')}{SEP}CH"
    )

    # -- 1000A: Submitter ---
    segments.append(f"NM1{SEP}41{SEP}2{SEP}{BILLING_ORG_NAME}{SEP}{SEP}{SEP}{SEP}{SEP}46{SEP}{AVAILITY_CUSTOMER_ID}")
    segments.append(f"PER{SEP}IC{SEP}{BILLING_ORG_NAME}{SEP}TE{SEP}{BILLING_PHONE}")

    # -- 1000B: Receiver ---
    segments.append(f"NM1{SEP}40{SEP}2{SEP}AVAILITY{SEP}{SEP}{SEP}{SEP}{SEP}46{SEP}030240928")

    # -- 2000A: Billing Provider Hierarchical Level ---
    hl_count = 1
    segments.append(f"HL{SEP}{hl_count}{SEP}{SEP}20{SEP}1")
    segments.append(f"PRV{SEP}BI{SEP}PXC{SEP}{BILLING_TAXONOMY}")

    # -- 2010AA: Billing Provider Name ---
    segments.append(
        f"NM1{SEP}85{SEP}2{SEP}{_clean(order.get('org_name', BILLING_ORG_NAME))}{SEP}{SEP}{SEP}{SEP}{SEP}"
        f"XX{SEP}{order.get('billing_npi', BILLING_NPI)}"
    )
    segments.append(f"N3{SEP}{_clean(order.get('org_address', BILLING_ADDR))}")
    segments.append(
        f"N4{SEP}{_clean(order.get('org_city', BILLING_CITY))}{SEP}"
        f"{order.get('org_state', BILLING_STATE)}{SEP}"
        f"{(order.get('org_zip', BILLING_ZIP) or '')[:5]}"
    )
    segments.append(f"REF{SEP}EI{SEP}{(order.get('tax_id', BILLING_TAX_ID) or '').replace('-', '')}")

    # -- 2000B: Subscriber Hierarchical Level ---
    hl_count += 1
    segments.append(f"HL{SEP}{hl_count}{SEP}1{SEP}22{SEP}0")
    segments.append(f"SBR{SEP}P{SEP}18{SEP}{order.get('insurance_group_number', '') or ''}{SEP}{SEP}{SEP}{SEP}{SEP}{SEP}{_filing_code(order.get('payer_type'))}")

    # -- 2010BA: Subscriber Name ---
    gender = _gender(order.get('gender'))
    dob = _fmt_date(order.get('dob'))
    segments.append(
        f"NM1{SEP}IL{SEP}1{SEP}{_clean(order['last_name'])}{SEP}"
        f"{_clean(order['first_name'])}{SEP}{SEP}{SEP}{SEP}MI{SEP}"
        f"{order.get('insurance_member_id', '')}"
    )
    segments.append(f"N3{SEP}{_clean(order.get('address1', ''))}")
    segments.append(
        f"N4{SEP}{_clean(order.get('city', ''))}{SEP}"
        f"{order.get('state', '')}{SEP}{(order.get('zip', '') or '')[:5]}"
    )
    segments.append(f"DMG{SEP}D8{SEP}{dob}{SEP}{gender}")

    # -- 2010BB: Payer Name ---
    payer_id = order.get('payer_code', '') or ''
    segments.append(
        f"NM1{SEP}PR{SEP}2{SEP}{_clean(order.get('payer_name', 'UNKNOWN'))}{SEP}"
        f"{SEP}{SEP}{SEP}{SEP}PI{SEP}{payer_id}"
    )

    # -- 2300: Claim Information ---
    total_charge = _total_charge(order, lines)
    pos = order.get('place_of_service', '12') or '12'

    segments.append(
        f"CLM{SEP}{bht_ref}{SEP}{total_charge}{SEP}{SEP}{SEP}"
        f"{pos}{SUB}B{SUB}1{SEP}Y{SEP}A{SEP}Y{SEP}Y"
    )

    # Prior auth
    if order.get('prior_auth_number'):
        segments.append(f"REF{SEP}G1{SEP}{order['prior_auth_number']}")

    # Diagnosis codes (HI segment)
    if diags:
        hi_parts = []
        for i, d in enumerate(diags[:12]):
            qualifier = "ABK" if i == 0 else "ABF"
            code = d['icd10_code'].replace('.', '')
            hi_parts.append(f"{qualifier}{SUB}{code}")
        segments.append(f"HI{SEP}{SEP.join(hi_parts)}")

    # -- 2310D: Referring/Ordering Provider ---
    if order.get('ph_npi'):
        segments.append(
            f"NM1{SEP}DN{SEP}1{SEP}{_clean(order.get('ph_last', ''))}{SEP}"
            f"{_clean(order.get('ph_first', ''))}{SEP}{SEP}{SEP}{SEP}XX{SEP}{order['ph_npi']}"
        )

    # -- 2400: Service Lines ---
    if lines:
        for i, line in enumerate(lines, 1):
            dos = _fmt_date(line.get('dos_start') or order.get('dos_start'))
            dos_end = _fmt_date(line.get('dos_end') or line.get('dos_start') or order.get('dos_start'))
            hcpcs = line['hcpcs_code']
            modifier = line.get('modifier', '')
            # Some rows have NULL charge_amount; treat as 0 for dry-run determinism.
            charge = f"{float(line.get('charge_amount') or 0):.2f}"
            units = str(line.get('units', 1))

            # Diagnosis pointers
            pointers = _parse_pointers(line.get('diagnosis_pointers'), len(diags))

            # SV1: Professional Service
            proc_code = f"HC{SUB}{hcpcs}"
            if modifier:
                for m in modifier.split(","):
                    m = m.strip()
                    if m:
                        proc_code += f"{SUB}{m}"

            segments.append(f"SV1{SEP}{proc_code}{SEP}{charge}{SEP}UN{SEP}{units}{SEP}{pos}{SEP}{SEP}{pointers}")

            # DTP: Date of Service
            if dos == dos_end:
                segments.append(f"DTP{SEP}472{SEP}D8{SEP}{dos}")
            else:
                segments.append(f"DTP{SEP}472{SEP}RD8{SEP}{dos}-{dos_end}")

            # Rendering provider NPI if different
            rnpi = line.get('rendering_npi')
            if rnpi and rnpi != order.get('billing_npi', BILLING_NPI):
                segments.append(f"NM1{SEP}82{SEP}1{SEP}{SEP}{SEP}{SEP}{SEP}{SEP}XX{SEP}{rnpi}")
    else:
        # Single line from order header
        dos = _fmt_date(order.get('dos_start'))
        dos_end = _fmt_date(order.get('dos_end') or order.get('dos_start'))
        hcpcs = order.get('hcpcs_code', '')
        charge = f"{float(order.get('billed_amount', 0)):.2f}"

        proc_code = f"HC{SUB}{hcpcs}"
        if order.get('modifier'):
            for m in order['modifier'].split(","):
                m = m.strip()
                if m:
                    proc_code += f"{SUB}{m}"

        segments.append(f"SV1{SEP}{proc_code}{SEP}{charge}{SEP}UN{SEP}1{SEP}{pos}{SEP}{SEP}1")

        if dos == dos_end:
            segments.append(f"DTP{SEP}472{SEP}D8{SEP}{dos}")
        else:
            segments.append(f"DTP{SEP}472{SEP}RD8{SEP}{dos}-{dos_end}")

    # -- SE: Transaction Set Trailer ---
    segment_count = len(segments) - 1  # exclude ISA, count from ST
    segments.append(f"SE{SEP}{segment_count}{SEP}{st_control}")

    # -- GE: Functional Group Trailer ---
    segments.append(f"GE{SEP}1{SEP}{gs_control}")

    # -- IEA: Interchange Control Trailer ---
    segments.append(f"IEA{SEP}1{SEP}{_pad(icn, 9, '0')}")

    return TERM.join(segments) + TERM


# --- HELPERS ---

def _pad(val: str, length: int, char: str = " ") -> str:
    """Pad string to exact length."""
    return str(val or "").ljust(length, char)[:length]


def _clean(val: Optional[str]) -> str:
    """Clean string for X12 -- remove special chars, uppercase."""
    if not val:
        return ""
    # Remove chars that conflict with X12 delimiters
    return val.upper().replace("~", "").replace("*", "").replace(":", "").replace("^", "").strip()


def _fmt_date(d) -> str:
    if isinstance(d, (date, datetime)):
        return d.strftime("%Y%m%d")
    return str(d).replace("-", "") if d else date.today().strftime("%Y%m%d")


def _gender(g: Optional[str]) -> str:
    if not g:
        return "U"
    return g[0].upper() if g[0].upper() in ("M", "F") else "U"


FILING_CODES = {
    "medicare": "MA", "medicare_b": "MB", "medicaid": "MC",
    "tricare": "CH", "commercial": "CI", "bcbs": "BL",
    "hmo": "HM", "workers_comp": "WC", "auto": "AM", "other": "CI",
}

def _filing_code(payer_type: Optional[str]) -> str:
    if not payer_type:
        return "CI"
    return FILING_CODES.get(payer_type.lower(), "CI")


def _total_charge(order: dict, lines: list) -> str:
    if lines:
        # Some line items may have NULL charge amounts; treat as 0 for determinism.
        total = sum(float(l.get("charge_amount") or 0) for l in lines)
    else:
        total = float(order.get("billed_amount") or order.get("total_billed") or 0)
    return f"{total:.2f}"


def _parse_pointers(pointers_str: Optional[str], max_diags: int) -> str:
    """Convert '1,2,3' to '1:2:3' for X12 diagnosis pointer format."""
    if not pointers_str:
        return "1" if max_diags > 0 else ""
    parts = [p.strip() for p in str(pointers_str).split(",") if p.strip()]
    return SUB.join(parts)
