"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveGovernanceRecommendation = approveGovernanceRecommendation;
exports.rejectGovernanceRecommendation = rejectGovernanceRecommendation;
const payer_intelligence_audit_js_1 = require("../../lib/payer-intelligence-audit.js");
const governance_constants_js_1 = require("./governance.constants.js");
async function approveGovernanceRecommendation(prisma, recommendationId, decidedBy, notes) {
    const rec = await prisma.governanceRecommendation.findUnique({ where: { id: recommendationId } });
    if (!rec)
        throw new Error("RECOMMENDATION_NOT_FOUND");
    if (rec.status !== governance_constants_js_1.GOVERNANCE_STATUS.PENDING) {
        throw new Error("RECOMMENDATION_NOT_PENDING");
    }
    await prisma.$transaction([
        prisma.governanceDecision.create({
            data: {
                recommendationId,
                decision: governance_constants_js_1.GOVERNANCE_DECISION_VALUE.APPROVED,
                decidedBy,
                notes: notes ?? null,
            },
        }),
        prisma.governanceRecommendation.update({
            where: { id: recommendationId },
            data: { status: governance_constants_js_1.GOVERNANCE_STATUS.APPROVED },
        }),
    ]);
    await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
        action: "governance_recommendation_approved",
        detail: {
            recommendationId,
            recommendationType: rec.recommendationType,
            draftPayload: rec.draftPayload,
            note: "Approval records intent only; production playbooks and payer rules are not modified automatically.",
        },
        actor: decidedBy,
    });
    return { success: true, recommendationId };
}
async function rejectGovernanceRecommendation(prisma, recommendationId, decidedBy, notes) {
    const rec = await prisma.governanceRecommendation.findUnique({ where: { id: recommendationId } });
    if (!rec)
        throw new Error("RECOMMENDATION_NOT_FOUND");
    if (rec.status !== governance_constants_js_1.GOVERNANCE_STATUS.PENDING) {
        throw new Error("RECOMMENDATION_NOT_PENDING");
    }
    await prisma.$transaction([
        prisma.governanceDecision.create({
            data: {
                recommendationId,
                decision: governance_constants_js_1.GOVERNANCE_DECISION_VALUE.REJECTED,
                decidedBy,
                notes: notes ?? null,
            },
        }),
        prisma.governanceRecommendation.update({
            where: { id: recommendationId },
            data: { status: governance_constants_js_1.GOVERNANCE_STATUS.REJECTED },
        }),
    ]);
    await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
        action: "governance_recommendation_rejected",
        detail: { recommendationId, recommendationType: rec.recommendationType },
        actor: decidedBy,
    });
    return { success: true, recommendationId };
}
//# sourceMappingURL=governance.decision.service.js.map