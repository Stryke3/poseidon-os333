/**
 * LMN / SWO bodies — placeholders must be supplied via user/case input only.
 * No diagnosis or history is invented here; empty/marker values mean "not supplied by user".
 * Fixed attestation wording is legal boilerplate only — it does not add patient-specific facts.
 */

export const LMN_TEMPLATE = `
Patient: {{patientName}}
DOB: {{dob}}

Diagnosis (user-entered text only — never inferred by the system):
{{diagnosis}}

Medical Necessity:
The patient requires {{device}} due to the following clinical indications:
{{clinicalJustification}}

Functional Limitations:
{{limitations}}

Previous Treatments:
{{failedTreatments}}

Physician Statement (fixed boilerplate — does not introduce facts beyond structured fields above):
I certify that this device is medically necessary.

Physician:
{{physicianName}}
NPI: {{npi}}

---
Non-clinical workflow (ML / routing): {{mlRoutingNote}}
`;

export const SWO_TEMPLATE = `
Patient: {{patientName}}
DOB: {{dob}}

Device: {{device}}
HCPCS Code: {{hcpcs}}

Order Date: {{orderDate}}

Physician:
{{physicianName}}
NPI: {{npi}}

Signature Required

---
Non-clinical workflow (ML / routing): {{mlRoutingNote}}
`;
