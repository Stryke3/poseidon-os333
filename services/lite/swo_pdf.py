"""SWO draft PDF — ICD-10, HCPCS, ordering/prescribing physician, provider NPI."""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any, Iterable
from xml.sax.saxutils import escape


def _clean_npi(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = "".join(c for c in raw.strip() if c.isdigit())
    if len(digits) != 10:
        return raw.strip()
    return f"{digits[0:3]}-{digits[3:6]}-{digits[6:10]}"


def _bullets(items: Iterable[str]) -> list[str]:
    return [x.strip() for x in items if x and str(x).strip()]


def render_swo_pdf(p: dict[str, Any], generated_at: datetime) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=0.65 * inch,
        leftMargin=0.65 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.65 * inch,
        title="SWO",
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "SWOTitle",
        parent=styles["Heading1"],
        fontSize=16,
        leading=20,
        textColor=colors.HexColor("#111111"),
        spaceAfter=6,
    )
    h2 = ParagraphStyle(
        "SWOH2",
        parent=styles["Heading2"],
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#1a1a1a"),
        spaceBefore=10,
        spaceAfter=6,
    )
    body = ParagraphStyle("SWOBody", parent=styles["Normal"], fontSize=9.5, leading=13)

    def P(text: str, style=body) -> Paragraph:
        return Paragraph(escape(str(text or "")), style)

    dx_list = p.get("diagnosis_codes") or []
    if not isinstance(dx_list, list):
        dx_list = []
    hc_list = p.get("hcpcs_codes") or []
    if not isinstance(hc_list, list):
        hc_list = []

    name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or "(not specified)"
    npi = _clean_npi(p.get("provider_npi"))
    physician = (p.get("ordering_provider") or "").strip() or "(not specified)"
    proc = (p.get("procedure_name") or "").strip()
    lat = (p.get("laterality") or "").strip()
    payer = (p.get("payer_name") or "").strip()
    member = (p.get("member_id") or "").strip()
    order_date = (p.get("order_date") or "").strip()

    story: list[Any] = []
    story.append(P("STANDARD WRITTEN ORDER (SWO) — DRAFT", title))
    story.append(
        P(
            f"Generated (UTC): {generated_at.strftime('%Y-%m-%d %H:%M')} · "
            "Human signature required before use as a legal order.",
            body,
        )
    )
    story.append(Spacer(1, 0.12 * inch))

    story.append(P("Patient", h2))
    story.append(P(f"Name: {name}", body))
    story.append(P(f"Date of birth: {p.get('dob') or '(not specified)'}", body))
    if p.get("address"):
        story.append(P(f"Address: {p.get('address')}", body))
    if p.get("phone"):
        story.append(P(f"Phone: {p.get('phone')}", body))

    story.append(P("Ordering / prescribing physician", h2))
    story.append(P(f"Physician / practice: {physician}", body))
    story.append(P(f"National Provider Identifier (NPI): {npi or '(not on file — add before submission)'}", body))

    story.append(P("Payer", h2))
    story.append(P(f"Primary payer: {payer or '(not specified)'}", body))
    story.append(P(f"Member / subscriber ID: {member or '(not specified)'}", body))

    story.append(P("Clinical order context", h2))
    if proc:
        story.append(P(f"Procedure / service: {proc}", body))
    if lat and lat.lower() != "unknown":
        story.append(P(f"Laterality: {lat}", body))
    if order_date:
        story.append(P(f"Order date: {order_date}", body))

    story.append(P("ICD-10 diagnosis codes (from Trident / intake record)", h2))
    dx_bullets = _bullets(str(x) for x in dx_list)
    if dx_bullets:
        for code in dx_bullets:
            story.append(P(f"• {code}", body))
    else:
        story.append(P("(none on file — add ICD-10 codes before packet submission)", body))

    story.append(P("HCPCS / supply coding (DME packet)", h2))
    hc_bullets = _bullets(str(x) for x in hc_list)
    if hc_bullets:
        for code in hc_bullets:
            story.append(P(f"• {code}", body))
    else:
        story.append(P("(none on file — add HCPCS lines per payer policy)", body))

    story.append(P("Internal notes", h2))
    story.append(P(p.get("notes") or "(none)", body))

    story.append(Spacer(1, 0.2 * inch))
    sig_data = [
        ["Ordering / prescribing physician signature", "", "Date"],
        ["", "", ""],
    ]
    t = Table(sig_data, colWidths=[3.2 * inch, 0.35 * inch, 2.0 * inch], rowHeights=[0.22 * inch, 0.35 * inch])
    t.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
                ("LINEABOVE", (0, 1), (0, 1), 0.5, colors.black),
                ("LINEABOVE", (2, 1), (2, 1), 0.5, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        P(
            "This PDF is a system-generated draft for compliance preparation. It does not replace a "
            "wet or compliant electronic signature on file with the payer or supplier.",
            ParagraphStyle("Foot", parent=body, fontSize=8, textColor=colors.grey),
        )
    )

    doc.build(story)
    return buf.getvalue()
