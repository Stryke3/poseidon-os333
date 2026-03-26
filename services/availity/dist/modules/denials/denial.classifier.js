"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyDenial = classifyDenial;
exports.classifyDenialCategory = classifyDenialCategory;
/**
 * Canonical attachment tokens used by the packet system.
 * Note: the appeal generator can only excerpt these canonical document types.
 */
const ATTACHMENTS = {
    LMN: "LMN",
    SWO: "SWO",
    CLINICAL_SUMMARY: "CLINICAL_SUMMARY",
    ATTACHMENTS_METADATA: "ATTACHMENTS_METADATA",
};
function toClassifierText(input) {
    return `${input.denialCode ?? ""} ${input.denialReasonText}`.toLowerCase();
}
/**
 * Keyword-based deterministic classifier (your snippet, adapted).
 * - Deterministic: same inputs -> same outputs.
 * - No fabricated clinical facts: strings are derived from denial text + fixed instructions.
 * - `requiredAttachments` are mapped to canonical packet doc types so evidence excerpting works.
 */
function classifyDenial(input) {
    const text = toClassifierText(input);
    if (text.includes("missing") || text.includes("documentation") || text.includes("not submitted")) {
        return {
            category: "MISSING_DOCUMENTATION",
            confidence: 0.9,
            recoveryType: "RESUBMIT",
            requiredFixes: ["Add missing documentation and rebuild packet"],
            requiredAttachments: [ATTACHMENTS.LMN, ATTACHMENTS.SWO, ATTACHMENTS.CLINICAL_SUMMARY],
            escalationSteps: [],
            explanation: ["Denial text indicates missing documentation."],
        };
    }
    if (text.includes("medical necessity") || text.includes("not medically necessary")) {
        return {
            category: "MEDICAL_NECESSITY",
            confidence: 0.9,
            recoveryType: "APPEAL",
            requiredFixes: ["Strengthen clinical justification", "Add conservative treatment history"],
            requiredAttachments: [ATTACHMENTS.LMN, ATTACHMENTS.CLINICAL_SUMMARY],
            escalationSteps: ["Consider peer-to-peer review if payer allows"],
            explanation: ["Denial text indicates medical necessity challenge."],
        };
    }
    if (text.includes("timely") || text.includes("filing")) {
        return {
            category: "TIMELY_FILING",
            confidence: 0.85,
            recoveryType: "REVIEW",
            requiredFixes: ["Confirm submission timestamps and filing deadlines"],
            requiredAttachments: [ATTACHMENTS.ATTACHMENTS_METADATA],
            escalationSteps: ["Escalate only if filing proof exists"],
            explanation: ["Denial text suggests timing/filing issue."],
        };
    }
    if (text.includes("eligibility") || text.includes("coverage terminated")) {
        return {
            category: "ELIGIBILITY",
            confidence: 0.9,
            recoveryType: "REVIEW",
            requiredFixes: ["Recheck eligibility and effective dates"],
            requiredAttachments: [ATTACHMENTS.ATTACHMENTS_METADATA],
            escalationSteps: [],
            explanation: ["Denial text suggests eligibility issue."],
        };
    }
    if (text.includes("duplicate")) {
        return {
            category: "DUPLICATE",
            confidence: 0.9,
            recoveryType: "REVIEW",
            requiredFixes: ["Confirm whether prior submission already exists"],
            requiredAttachments: [ATTACHMENTS.ATTACHMENTS_METADATA],
            escalationSteps: [],
            explanation: ["Denial text indicates duplicate submission."],
        };
    }
    if (text.includes("code") || text.includes("coding") || text.includes("hcpcs")) {
        return {
            category: "CODING_MISMATCH",
            confidence: 0.8,
            recoveryType: "RESUBMIT",
            requiredFixes: ["Correct coding mismatch"],
            requiredAttachments: [ATTACHMENTS.SWO, ATTACHMENTS.LMN],
            escalationSteps: [],
            explanation: ["Denial text suggests coding mismatch."],
        };
    }
    return {
        category: "OTHER",
        confidence: 0.4,
        recoveryType: "REVIEW",
        requiredFixes: ["Manual review required"],
        requiredAttachments: [],
        escalationSteps: [],
        explanation: ["No deterministic rule matched this denial."],
    };
}
/**
 * Backwards-compatible wrapper for the older “category-only” API.
 * Keeps existing tests intact while enabling the controller to use full `classifyDenial`.
 */
function classifyDenialCategory(input) {
    const text = toClassifierText({ denialCode: input.denialCode, denialReasonText: input.denialReasonText });
    const res = classifyDenial({ denialCode: input.denialCode, denialReasonText: input.denialReasonText });
    let matchedPhrase = null;
    if (res.category === "MISSING_DOCUMENTATION") {
        matchedPhrase = text.includes("not submitted") ? "not submitted" : text.includes("documentation") ? "documentation" : text.includes("missing") ? "missing" : null;
    }
    else if (res.category === "MEDICAL_NECESSITY") {
        matchedPhrase = text.includes("not medically necessary") ? "not medically necessary" : "medical necessity";
    }
    else if (res.category === "TIMELY_FILING") {
        matchedPhrase = text.includes("timely") ? "timely" : "filing";
    }
    else if (res.category === "ELIGIBILITY") {
        matchedPhrase = text.includes("coverage terminated") ? "coverage terminated" : "eligibility";
    }
    else if (res.category === "DUPLICATE") {
        matchedPhrase = "duplicate";
    }
    else if (res.category === "CODING_MISMATCH") {
        matchedPhrase = text.includes("hcpcs") ? "hcpcs" : "coding";
    }
    return {
        category: res.category,
        confidence: res.confidence,
        matchedPhrase,
        explanation: res.explanation,
    };
}
//# sourceMappingURL=denial.classifier.js.map