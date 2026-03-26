"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recommendationEngineService = exports.RecommendationEngineService = void 0;
const node_crypto_1 = require("node:crypto");
const prisma_js_1 = require("../../lib/prisma.js");
const governance_constants_js_1 = require("../governance/governance.constants.js");
const recommendationEngine_service_js_1 = require("./recommendationEngine.service.js");
/**
 * Playbook-scoped recommendation helpers driven by latest `PlaybookPerformance` snapshot.
 * Uses the same PENDING dedupe semantics as the batch learning evaluator.
 */
class RecommendationEngineService {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Evaluates the most recent performance row for `(playbookId, version)` and may open
     * a single governance recommendation. Returns null if sample is too small or no rule fires.
     */
    async evaluatePlaybook(playbookId, version) {
        const perf = await this.db.playbookPerformance.findFirst({
            where: { playbookId, version },
            orderBy: { calculatedAt: "desc" },
        });
        if (!perf || perf.totalCases < 10) {
            return null;
        }
        const approvalRate = perf.totalCases > 0 ? perf.approvals / perf.totalCases : 0;
        if (approvalRate >= 0.85) {
            const draftPayload = {
                playbookId,
                version,
                action: "promote",
            };
            if (await (0, recommendationEngine_service_js_1.pendingDuplicateRecommendation)(this.db, {
                recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.PROMOTE_PLAYBOOK,
                payerId: perf.payerId,
                targetId: playbookId,
                draftPayload: draftPayload,
            })) {
                return null;
            }
            const evidence = {
                totalCases: perf.totalCases,
                approvalRate,
                avgTurnaroundDays: perf.avgTurnaroundDays,
                references: {
                    playbookPerformanceId: perf.id,
                },
                policy: {
                    explainable: true,
                    noAutoApply: true,
                    rule: "approval_rate_promote_playbook",
                },
            };
            return this.db.governanceRecommendation.create({
                data: {
                    payerId: perf.payerId,
                    recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.PROMOTE_PLAYBOOK,
                    targetId: playbookId,
                    targetType: governance_constants_js_1.GOVERNANCE_TARGET_TYPE.PLAYBOOK,
                    draftPayload,
                    evidence,
                    rationale: `Playbook version ${version} exceeds promotion threshold with ${Math.round(approvalRate * 100)}% approval over ${perf.totalCases} cases.`,
                    status: governance_constants_js_1.GOVERNANCE_STATUS.PENDING,
                },
            });
        }
        if (approvalRate < 0.5) {
            const draftPayload = {
                playbookId,
                version,
                action: "revise",
            };
            if (await (0, recommendationEngine_service_js_1.pendingDuplicateRecommendation)(this.db, {
                recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.REVISE_PLAYBOOK,
                payerId: perf.payerId,
                targetId: playbookId,
                draftPayload: draftPayload,
            })) {
                return null;
            }
            const evidence = {
                totalCases: perf.totalCases,
                approvalRate,
                denialReasons: perf.denialReasons,
                references: {
                    playbookPerformanceId: perf.id,
                },
                policy: {
                    explainable: true,
                    noAutoApply: true,
                    rule: "approval_rate_revise_playbook",
                },
            };
            return this.db.governanceRecommendation.create({
                data: {
                    payerId: perf.payerId,
                    recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.REVISE_PLAYBOOK,
                    targetId: playbookId,
                    targetType: governance_constants_js_1.GOVERNANCE_TARGET_TYPE.PLAYBOOK,
                    draftPayload,
                    evidence,
                    rationale: `Playbook version ${version} is underperforming with ${Math.round(approvalRate * 100)}% approval.`,
                    status: governance_constants_js_1.GOVERNANCE_STATUS.PENDING,
                },
            });
        }
        return null;
    }
    async createRuleSuggestionFromOutcomes(input) {
        const approvedManualRequirement = await this.db.manualRequirement.findFirst({
            where: {
                payerId: input.payerId,
                active: true,
                reviewState: governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.APPROVED,
                OR: [{ planName: input.pattern.planName ?? null }, { planName: null }],
                AND: [
                    { OR: [{ deviceCategory: null }, { deviceCategory: input.pattern.deviceCategory ?? null }] },
                    { OR: [{ hcpcsCode: null }, { hcpcsCode: input.pattern.hcpcsCode ?? null }] },
                    { OR: [{ diagnosisCode: null }, { diagnosisCode: input.pattern.diagnosisCode ?? null }] },
                ],
            },
            select: { id: true },
        });
        if (approvedManualRequirement) {
            throw new Error("MANUAL_REQUIREMENT_APPROVED_GUARD");
        }
        const suggestionKey = `denial_pattern:${(0, node_crypto_1.createHash)("sha256").update(input.repeatedDenialReason).digest("hex").slice(0, 24)}`;
        const suggestionValue = {
            repeatedDenialReason: input.repeatedDenialReason,
            proposedAction: "add_requirement_or_playbook_revision",
        };
        return this.db.learnedRuleSuggestion.create({
            data: {
                payerId: input.payerId,
                planName: input.pattern.planName ?? null,
                deviceCategory: input.pattern.deviceCategory ?? null,
                hcpcsCode: input.pattern.hcpcsCode ?? null,
                diagnosisCode: input.pattern.diagnosisCode ?? null,
                suggestionType: governance_constants_js_1.LEARNED_SUGGESTION_TYPE.DOC_REQUIREMENT_HINT,
                suggestionKey,
                suggestionValue,
                evidence: {
                    ...input.evidence,
                    policy: {
                        explainable: true,
                        noAutoApply: true,
                        manualApprovedGuard: true,
                    },
                },
                status: governance_constants_js_1.LEARNED_SUGGESTION_STATUS.DRAFT,
            },
        });
    }
}
exports.RecommendationEngineService = RecommendationEngineService;
exports.recommendationEngineService = new RecommendationEngineService(prisma_js_1.prisma);
//# sourceMappingURL=recommendationEnginePlaybook.service.js.map