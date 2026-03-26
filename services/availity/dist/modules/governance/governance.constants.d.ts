/** Values for `PayerManual.parsedStatus`. */
export declare const MANUAL_PARSED_STATUS: {
    readonly PENDING: "PENDING";
    readonly PARSED: "PARSED";
    readonly REVIEWED: "REVIEWED";
    readonly FAILED: "FAILED";
};
/** Persisted `ManualRequirement.requirementType` (manual-authoritative baseline). */
export declare const REQUIREMENT_TYPE: {
    readonly REQUIRED_DOCUMENT: "REQUIRED_DOCUMENT";
    readonly AUTH_REQUIRED: "AUTH_REQUIRED";
    readonly TIMING_RULE: "TIMING_RULE";
    readonly RESTRICTION: "RESTRICTION";
    readonly ESCALATION: "ESCALATION";
};
/** Persisted `ManualRequirement.reviewState`. APPROVED is protected from automatic re-extract. */
export declare const MANUAL_REQUIREMENT_REVIEW_STATE: {
    readonly AUTO_PENDING: "AUTO_PENDING";
    readonly AUTO_ACCEPT: "AUTO_ACCEPT";
    readonly PENDING_REVIEW: "PENDING_REVIEW";
    readonly APPROVED: "APPROVED";
    readonly REJECTED: "REJECTED";
};
export declare const MANUAL_EXTRACTION_SOURCE: {
    readonly DETERMINISTIC: "DETERMINISTIC";
    readonly LLM: "LLM";
};
/** Confidence at or above this threshold (deterministic only) gets AUTO_ACCEPT + active. */
export declare const MANUAL_EXTRACTION_AUTO_ACCEPT_CONFIDENCE = 0.8;
/** Internal extractor labels before mapping to {@link REQUIREMENT_TYPE}. */
export declare const MANUAL_REQUIREMENT_CATEGORY: {
    readonly REQUIRED_DOCUMENT: "REQUIRED_DOCUMENT";
    readonly AUTHORIZATION_REQUIREMENT: "AUTHORIZATION_REQUIREMENT";
    readonly DIAGNOSIS_DEVICE_RESTRICTION: "DIAGNOSIS_DEVICE_RESTRICTION";
    readonly TIMING_RULE: "TIMING_RULE";
    readonly ESCALATION: "ESCALATION";
    readonly DOCUMENTATION_LANGUAGE: "DOCUMENTATION_LANGUAGE";
    readonly SUBMISSION_LIMITATION: "SUBMISSION_LIMITATION";
};
export declare const EXTRACTION_CONFIDENCE: {
    readonly HIGH: "HIGH";
    readonly MEDIUM: "MEDIUM";
    readonly LOW: "LOW";
};
export declare function confidenceToFloat(tier: string): number;
export declare function mapCategoryToRequirementType(category: string): string;
/** Governance queue + decisions */
export declare const GOVERNANCE_STATUS: {
    readonly PENDING: "PENDING";
    readonly APPROVED: "APPROVED";
    readonly REJECTED: "REJECTED";
    readonly IMPLEMENTED: "IMPLEMENTED";
    readonly SUPERSEDED: "SUPERSEDED";
};
export declare const GOVERNANCE_RECOMMENDATION_TYPE: {
    readonly PROMOTE_PLAYBOOK: "PROMOTE_PLAYBOOK";
    readonly REVISE_PLAYBOOK: "REVISE_PLAYBOOK";
    readonly RETIRE_PLAYBOOK: "RETIRE_PLAYBOOK";
    readonly CREATE_RULE: "CREATE_RULE";
    readonly ADJUST_SCORE_WEIGHT: "ADJUST_SCORE_WEIGHT";
};
export declare const GOVERNANCE_TARGET_TYPE: {
    readonly PLAYBOOK: "PLAYBOOK";
    readonly RULE: "RULE";
    readonly SCORE_PROFILE: "SCORE_PROFILE";
};
export declare const GOVERNANCE_DECISION_VALUE: {
    readonly APPROVED: "APPROVED";
    readonly REJECTED: "REJECTED";
};
/** Learned suggestion lifecycle */
export declare const LEARNED_SUGGESTION_STATUS: {
    readonly DRAFT: "DRAFT";
    readonly APPROVED: "APPROVED";
    readonly REJECTED: "REJECTED";
    readonly APPLIED: "APPLIED";
};
export declare const LEARNED_SUGGESTION_TYPE: {
    readonly SCORE_WEIGHT: "SCORE_WEIGHT";
    readonly DOC_REQUIREMENT_HINT: "DOC_REQUIREMENT_HINT";
    readonly PLAYBOOK_REVISION: "PLAYBOOK_REVISION";
    readonly ROUTING_HINT: "ROUTING_HINT";
};
//# sourceMappingURL=governance.constants.d.ts.map