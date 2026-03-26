import type { ExtractedRequirement } from "../governance/manual-requirement-extractor.js";
/** Normalized extractor output before review metadata or DB persistence. */
export type ExtractedRequirementCandidate = {
    requirementType: "REQUIRED_DOCUMENT" | "AUTH_REQUIRED" | "TIMING_RULE" | "RESTRICTION" | "ESCALATION";
    requirementKey: string;
    requirementValue: string;
    sourceExcerpt: string;
    confidence: number;
    payerId?: string;
    planName?: string;
    deviceCategory?: string;
    hcpcsCode?: string;
    diagnosisCode?: string;
};
export type ManualRequirementCandidate = ExtractedRequirement & {
    reviewState: string;
    extractionSource: string;
    active: boolean;
};
//# sourceMappingURL=manualRequirement.types.d.ts.map