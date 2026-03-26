import type { DenialCategory, DenialClassificationResult, DenialIntakeInput } from "./denial.types.js";
/**
 * Keyword-based deterministic classifier (your snippet, adapted).
 * - Deterministic: same inputs -> same outputs.
 * - No fabricated clinical facts: strings are derived from denial text + fixed instructions.
 * - `requiredAttachments` are mapped to canonical packet doc types so evidence excerpting works.
 */
export declare function classifyDenial(input: {
    denialCode?: string;
    denialReasonText: string;
}): DenialClassificationResult;
/**
 * Backwards-compatible wrapper for the older “category-only” API.
 * Keeps existing tests intact while enabling the controller to use full `classifyDenial`.
 */
export declare function classifyDenialCategory(input: DenialIntakeInput): {
    category: DenialCategory;
    confidence: number;
    matchedPhrase: string | null;
    explanation: string[];
};
//# sourceMappingURL=denial.classifier.d.ts.map