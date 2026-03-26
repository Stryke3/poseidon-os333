/**
 * Clinical document generation policy (enforced in code paths below).
 *
 * - Do not generate clinical facts not present in input.
 * - Do not fabricate diagnosis, history, or exam findings.
 * - Rendered values must map to supplied input/case fields (see per-document `_traceability`).
 * - Every `PriorAuthDocument` persists `inputSnapshot` + monotonic `version` per (caseId, type).
 */
export declare const CLINICAL_GENERATION_POLICY_VERSION = "1.0";
export declare const CLINICAL_GENERATION_RULES: readonly ["No clinical facts may be invented beyond user/case-supplied fields.", "Diagnosis and history must come only from caller input — never ICD lookup or model inference here.", "Template output must be traceable to explicit inputs (see inputSnapshot._traceability.variableSources).", "Each document row stores a full inputSnapshot; each regeneration increments version for that document type."];
/** Shown when optional clinical text was not supplied — not a diagnosis, not inferred. */
export declare const TEXT_NOT_SUPPLIED_BY_USER = "[No diagnosis or clinical text was supplied by the user for this field \u2014 nothing was inferred.]";
/**
 * Maps each LMN template variable to its source path in `DocumentGeneratorInput` (audit).
 */
export declare function lmnVariableSources(): Record<string, string>;
export declare function swoVariableSources(): Record<string, string>;
//# sourceMappingURL=compliance.d.ts.map