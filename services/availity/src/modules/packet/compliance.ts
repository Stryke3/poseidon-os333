/**
 * Clinical document generation policy (enforced in code paths below).
 *
 * - Do not generate clinical facts not present in input.
 * - Do not fabricate diagnosis, history, or exam findings.
 * - Rendered values must map to supplied input/case fields (see per-document `_traceability`).
 * - Every `PriorAuthDocument` persists `inputSnapshot` + monotonic `version` per (caseId, type).
 */

export const CLINICAL_GENERATION_POLICY_VERSION = "1.0";

export const CLINICAL_GENERATION_RULES = [
  "No clinical facts may be invented beyond user/case-supplied fields.",
  "Diagnosis and history must come only from caller input — never ICD lookup or model inference here.",
  "Template output must be traceable to explicit inputs (see inputSnapshot._traceability.variableSources).",
  "Each document row stores a full inputSnapshot; each regeneration increments version for that document type.",
] as const;

/** Shown when optional clinical text was not supplied — not a diagnosis, not inferred. */
export const TEXT_NOT_SUPPLIED_BY_USER =
  "[No diagnosis or clinical text was supplied by the user for this field — nothing was inferred.]";

/**
 * Maps each LMN template variable to its source path in `DocumentGeneratorInput` (audit).
 */
export function lmnVariableSources(): Record<string, string> {
  return {
    patientName: "concat(input.patient.firstName, input.patient.lastName)",
    dob: "input.patient.dob",
    diagnosis: "input.diagnosis (empty → TEXT_NOT_SUPPLIED_BY_USER)",
    device: "input.device",
    clinicalJustification: "input.justification",
    limitations: "input.limitations",
    failedTreatments: "input.failedTreatments",
    physicianName: "input.physician.name",
    npi: "input.physician.npi",
    mlRoutingNote: "pipeline.template-modifier (non-clinical routing only)",
  };
}

export function swoVariableSources(): Record<string, string> {
  return {
    patientName: "concat(input.patient.firstName, input.patient.lastName)",
    dob: "input.patient.dob",
    device: "input.device",
    hcpcs: "input.hcpcs",
    orderDate: "input.orderDate (empty if omitted — not backfilled with system date)",
    physicianName: "input.physician.name",
    npi: "input.physician.npi",
    mlRoutingNote: "pipeline.template-modifier (non-clinical routing only)",
  };
}
