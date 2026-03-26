"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GOVERNANCE_DRAFT_STATUS = exports.GOVERNANCE_DRAFT_KIND = void 0;
exports.createDraftFromRecommendation = createDraftFromRecommendation;
const payer_intelligence_audit_js_1 = require("../../lib/payer-intelligence-audit.js");
const governance_constants_js_1 = require("./governance.constants.js");
exports.GOVERNANCE_DRAFT_KIND = {
    PLAYBOOK_REVISION: "PLAYBOOK_REVISION",
    PAYER_RULE_CHANGE: "PAYER_RULE_CHANGE",
};
exports.GOVERNANCE_DRAFT_STATUS = {
    DRAFT: "DRAFT",
    ARCHIVED: "ARCHIVED",
};
function draftKindForRecommendation(recommendationType) {
    if (recommendationType === governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.ADJUST_SCORE_WEIGHT) {
        return exports.GOVERNANCE_DRAFT_KIND.PAYER_RULE_CHANGE;
    }
    return exports.GOVERNANCE_DRAFT_KIND.PLAYBOOK_REVISION;
}
/**
 * Materializes a persisted draft artifact from a queue recommendation (evidence-linked).
 * Does not change production playbooks or payer rules.
 */
async function createDraftFromRecommendation(prisma, recommendationId, actor) {
    const rec = await prisma.governanceRecommendation.findUnique({
        where: { id: recommendationId },
    });
    if (!rec)
        throw new Error("RECOMMENDATION_NOT_FOUND");
    const existingOpen = await prisma.governanceDraft.findFirst({
        where: { recommendationId: rec.id, status: exports.GOVERNANCE_DRAFT_STATUS.DRAFT },
    });
    if (existingOpen) {
        return existingOpen;
    }
    const payerId = rec.payerId?.trim() ? rec.payerId.trim() : "UNKNOWN";
    const kind = draftKindForRecommendation(rec.recommendationType);
    const payload = {
        sourceRecommendation: {
            id: rec.id,
            recommendationType: rec.recommendationType,
            targetId: rec.targetId,
            targetType: rec.targetType,
            rationale: rec.rationale,
            status: rec.status,
        },
        draftPayload: rec.draftPayload,
        evidence: rec.evidence,
        implementationNote: kind === exports.GOVERNANCE_DRAFT_KIND.PLAYBOOK_REVISION
            ? "Use playbook admin to create a new version or clone; paste structured changes after clinical/compliance review."
            : "Use payer behavior rules admin to adjust weights or flags after review — no automatic apply.",
        suggestedNextSteps: kind === exports.GOVERNANCE_DRAFT_KIND.PLAYBOOK_REVISION
            ? [
                "Open playbook for payer and compare to evidence.outcomeIds sample",
                "Draft documentRules / strategy changes in a non-active version",
            ]
            : [
                "Review PayerRule rows for this payer/plan scope",
                "Adjust requires* flags or notes per evidence",
            ],
    };
    const title = kind === exports.GOVERNANCE_DRAFT_KIND.PLAYBOOK_REVISION
        ? `Draft playbook follow-up: ${rec.recommendationType}`
        : `Draft payer rule follow-up: ${rec.recommendationType}`;
    const draft = await prisma.governanceDraft.create({
        data: {
            kind,
            payerId,
            recommendationId: rec.id,
            title,
            payload: payload,
            status: exports.GOVERNANCE_DRAFT_STATUS.DRAFT,
        },
    });
    await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
        action: "governance_draft_created",
        payerId,
        detail: {
            draftId: draft.id,
            kind,
            recommendationId: rec.id,
        },
        actor,
    });
    return draft;
}
//# sourceMappingURL=governance.draft.service.js.map