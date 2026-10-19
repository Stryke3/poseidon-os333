"""Pure helpers for the Mommy Care Kit intake and paid-posted workflows."""
from __future__ import annotations

from hashlib import sha256
from html import escape
import re
from typing import Iterable, Mapping


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def stable_record_id(source_reference: str) -> str:
    """Return a deterministic tracker ID without embedding patient data."""
    normalized = source_reference.strip()
    if not normalized:
        raise ValueError("source_reference is required")
    return "MCK-" + sha256(normalized.encode("utf-8")).hexdigest()[:10].upper()


def normalize_recipients(raw: str | Iterable[str], *, internal_only: bool = False) -> list[str]:
    if isinstance(raw, str):
        candidates = [item.strip() for item in raw.split(",")]
    else:
        candidates = [str(item).strip() for item in raw]
    recipients: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        address = candidate.lower()
        if not address or address in seen:
            continue
        if not _EMAIL_RE.fullmatch(address):
            raise ValueError(f"Invalid email recipient: {candidate}")
        if internal_only and not address.endswith("@strykefox.com"):
            raise ValueError("Paid-posted recipients must use approved @strykefox.com addresses")
        recipients.append(address)
        seen.add(address)
    if not recipients:
        raise ValueError("At least one recipient is required")
    return recipients


def format_shipping_address(address: Mapping[str, object]) -> str:
    line1 = str(address.get("address_line1") or address.get("line1") or "").strip()
    line2 = str(address.get("address_line2") or address.get("line2") or "").strip()
    city = str(address.get("city") or "").strip()
    state = str(address.get("state") or "").strip()
    zip_code = str(address.get("zip_code") or address.get("zip") or "").strip()
    if not line1 or not city or not state or not zip_code:
        raise ValueError("A complete shipping address is required before paid notification")
    parts = [line1]
    if line2:
        parts.append(line2)
    parts.append(f"{city}, {state} {zip_code}")
    return "\n".join(parts)


def build_paid_notification(patient_name: str, address: Mapping[str, object]) -> tuple[str, str]:
    name = " ".join(patient_name.split())
    if not name:
        raise ValueError("patient_name is required")
    formatted_address = format_shipping_address(address)
    subject = f"Payment Posted — {name}"
    body = (
        "Payment has been posted for the following Mommy Care Kit patient.\n\n"
        f"Patient: {name}\n"
        "Shipping address:\n"
        f"{formatted_address}\n"
    )
    return subject, body


def build_welcome_email(
    *,
    first_name: str,
    insurance_name: str | None,
    provider_summary: str | None,
    needs_dob: bool,
    needs_provider: bool,
    needs_insurance: bool = True,
    needs_id: bool = True,
    needs_address: bool = True,
) -> tuple[str, str]:
    patient_first = " ".join((first_name or "").split()) or "there"
    requests: list[str] = []
    if needs_insurance:
        label = f"your {insurance_name} insurance card" if insurance_name else "your insurance card"
        requests.append(f"A clear photo of the front and back of {label}")
    if needs_id:
        requests.append("A clear photo of your current photo ID")
    if needs_address:
        requests.append("Your full home shipping address, including apartment or unit number if applicable")
    if needs_dob:
        requests.append("Your date of birth")
    if needs_provider:
        requests.append("Your OB/GYN's full name, practice, office phone number, and fax number if available")

    bullets = "\n".join(f"- {item}" for item in requests)
    provider_line = (
        f"\nWe currently have {provider_summary} listed as your provider contact.\n"
        if provider_summary
        else ""
    )
    subject = "Welcome to Mommy Care Kit 💕 We’re So Happy You’re Here"
    body = f"""Hi {patient_first},

Congratulations! 💕 Thank you for choosing StrykeFox Medical’s Mommy Care Kit / Maternity CarePath. We’re so happy to have you here and look forward to helping make this part of your pregnancy a little easier.

We’ve received your request and are getting your CarePath started.

When you have a moment, please reply with:
{bullets}
{provider_line}
What happens next:

Our team will contact your provider directly to obtain the prescription and supporting documentation needed for the products you requested. We’ll then review your insurance benefits and any authorization requirements, complete the necessary paperwork, and move your Mommy Care Kit toward ordering once everything required is in place.

Heather will be your Mommy Care Consultant and will help guide you through the process. If you haven’t already heard from her, you should expect a text from her shortly. She’ll be your point of contact if we need anything else along the way.

The entire process usually takes about 4–6 weeks, depending largely on how quickly we receive the necessary documentation from your provider and complete the insurance review. The sooner we receive everything from you and your provider, the sooner we can get to work for you.

We’re so glad you’re here, {patient_first}! 💗

Warmly,
The Maternity CarePath Team
StrykeFox Medical
Mommy Care Kit 💕
patients@strykefox.com
888-508-0712
"""
    return subject, body


def html_mail_content(plain_text: str) -> str:
    """Minimal HTML wrapper; escapes all patient-controlled content."""
    return "<div style=\"font-family:Arial,sans-serif;white-space:pre-wrap\">" + escape(plain_text) + "</div>"
