# =============================================================================
# Shared POD + CMS/DMEPOS operational guidance (PDF + API + dashboard HTML)
# =============================================================================
from __future__ import annotations

from typing import Any

CMS_CHECKLIST_BODY = """
CMS-aligned DMEPOS documentation & delivery items (complete before billing / audit)

Use this as an operational checklist. Payer-specific, LCD/NCD, and state rules may require additional items.

A. Order & medical necessity
  • Valid Standard Written Order (SWO) / Detailed Written Order (DWO) on file with required elements for each HCPCS.
  • Diagnosis codes on the order / claim supported by medical record (ICD-10 pointers match line items).
  • CMN, face-to-face encounter, or sleep study / specialty documentation when applicable to code or payer.

B. Delivery & proof (POD)
  • Proof of Delivery shows DATE OF DELIVERY and identifies the PATIENT or authorized recipient.
  • Recipient RELATIONSHIP to patient when signer is not the patient (e.g., caregiver, spouse).
  • Description of items delivered aligns with billed HCPCS; serial numbers / asset tags captured when applicable.
  • Signature (wet or compliant electronic) of recipient; retain with order.

C. Supplier / intake compliance (DMEPOS context)
  • Beneficiary contact verified; delivery address matches payer and medical necessity context where required.
  • Retain delivery manifest, packing list, or carrier POD alongside internal POD form.
  • Timely filing: confirm timely filing window vs. DOS and payer rules before submission.

D. Claim packaging (CMS-1500 / electronic equivalent)
  • POS, modifiers, units, and charge lines align with SWO, delivery, and fee schedule.
  • Supporting documents indexed: SWO, POD, CMN/F2F as applicable, delivery records.
""".strip()

POD_TEMPLATE_BODY = """
I acknowledge receipt of the DME / supplies listed for the patient named above on the date below.

Recipient printed name: _________________________________  Relationship to patient: ___________________

Delivery date: ____ / ____ / ______    Delivery address (if different): ___________________________________

Signature: _________________________________   Date signed: ____ / ____ / ______

Clinic / supplier rep (if present): _________________________   NPI (optional): _________________________
""".strip()

STAFF_INSTRUCTIONS_TEMPLATE = """
1. Obtain executed POD (this page or carrier/equivalent) with all CMS-aligned fields above.
2. Upload the scanned POD to the order: POST /api/v1/orders/{order_id}/documents with doc_type=pod (or your intake path).
3. Link the canonical POD file: POST /orders/{order_id}/pod-received with pod_document_id and received_at.
4. Ensure SWO and CMS-1500 review PDFs are generated and attached before billing scrub / claim submission.
5. Retain delivery records per your compliance retention policy; do not transmit unnecessary PHI externally.
""".strip()

GUIDANCE_DISCLAIMER = (
    "Operational template only; verify payer, LCD/NCD, and counsel for legal/compliance interpretation."
)


def staff_instructions_for_order(order_id: str) -> str:
    return STAFF_INSTRUCTIONS_TEMPLATE.strip().replace("{order_id}", order_id)


def pod_delivery_guidance_payload(example_order_id: str | None) -> dict[str, Any]:
    """JSON-safe structure for dashboard / Kanban (matches PDF substance)."""
    oid = example_order_id or "{order_id}"
    return {
        "title": "Proof of Delivery (POD) & CMS documentation",
        "subtitle": "DMEPOS delivery and claim-support checklist (same content as generated POD package PDF)",
        "disclaimer": GUIDANCE_DISCLAIMER,
        "sections": [
            {
                "id": "cms_checklist",
                "title": "CMS-required delivery & documentation checklist",
                "body": CMS_CHECKLIST_BODY,
            },
            {
                "id": "pod_template",
                "title": "POD capture template (complete at delivery)",
                "body": POD_TEMPLATE_BODY,
            },
            {
                "id": "staff",
                "title": "Staff instructions (Poseidon Core)",
                "body": staff_instructions_for_order(oid),
            },
        ],
    }
