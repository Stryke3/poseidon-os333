import { type ExtractedRequirement } from "../governance/manual-requirement-extractor.js";
import type { ManualRequirementCandidate } from "./manualRequirement.types.js";
export type { ExtractedRequirement, ManualRequirementCandidate };
/** Preview extraction (deterministic, optional LLM candidates when `useLlm` is true). */
export declare function previewManualExtraction(rawText: string, opts?: {
    useLlm?: boolean;
}): Promise<ManualRequirementCandidate[]>;
/** Shorthand: regex-only preview without LLM metadata merging. */
export declare function previewManualExtractionDeterministic(rawText: string): ExtractedRequirement[];
//# sourceMappingURL=manualExtraction.service.d.ts.map