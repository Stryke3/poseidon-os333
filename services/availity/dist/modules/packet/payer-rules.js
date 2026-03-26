"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePayerRules = resolvePayerRules;
/**
 * Payer-specific hints only — extend with real payer manuals / LOB rules.
 * TODO: Map each payer id to documented attachment and wording requirements from payer contracts.
 */
const PROFILES = {
    default: {
        profileId: "default",
        requiredAttachmentLabels: [
            "Signed SWO on file",
            "Clinical notes supporting medical necessity (if applicable)",
        ],
        notesForPacket: [
            "Verify payer-specific DME documentation checklist before submission.",
        ],
    },
    medicare_like: {
        profileId: "medicare_like",
        requiredAttachmentLabels: [
            "Standard Written Order (SWO) meeting CMS elements",
            "Proof of delivery (when required)",
        ],
        notesForPacket: [
            "TODO: Align required attachments with Noridian / CGS LCD documentation for the billed HCPCS.",
        ],
    },
};
function resolvePayerRules(payerId, explicitProfileId) {
    if (explicitProfileId && PROFILES[explicitProfileId]) {
        return PROFILES[explicitProfileId];
    }
    const lower = payerId.toLowerCase();
    if (lower.includes("medicare") || lower.includes("cms")) {
        return PROFILES.medicare_like;
    }
    return PROFILES.default;
}
//# sourceMappingURL=payer-rules.js.map