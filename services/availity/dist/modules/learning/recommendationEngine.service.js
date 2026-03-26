"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recommendationEngineService = exports.RecommendationEngineService = void 0;
exports.pendingDuplicateRecommendation = pendingDuplicateRecommendation;
exports.runLearningEvaluation = runLearningEvaluation;
const node_crypto_1 = require("node:crypto");
const prisma_js_1 = require("../../lib/prisma.js");
const payer_intelligence_audit_js_1 = require("../../lib/payer-intelligence-audit.js");
const governance_constants_js_1 = require("../governance/governance.constants.js");
const learningEvidence_service_js_1 = require("./learningEvidence.service.js");
const playbookPerformance_service_js_1 = require("./playbookPerformance.service.js");
function scopeKey(o) {
    return [
        o.playbookId,
        o.playbookVersion,
        o.payerId,
        o.planName ?? "",
        o.deviceCategory ?? "",
        o.hcpcsCode ?? "",
        o.diagnosisCode ?? "",
    ].join("|");
}
function recommendationDedupeHash(input) {
    return (0, node_crypto_1.createHash)("sha256")
        .update(JSON.stringify({
        recommendationType: input.recommendationType,
        payerId: input.payerId,
        targetId: input.targetId,
        draftPayload: input.draftPayload,
    }))
        .digest("hex");
}
async function pendingDuplicateRecommendation(prisma, input) {
    const want = recommendationDedupeHash(input);
    const candidates = await prisma.governanceRecommendation.findMany({
        where: {
            status: governance_constants_js_1.GOVERNANCE_STATUS.PENDING,
            payerId: input.payerId,
            recommendationType: input.recommendationType,
        },
        select: { targetId: true, draftPayload: true },
    });
    for (const c of candidates) {
        const got = recommendationDedupeHash({
            recommendationType: input.recommendationType,
            payerId: input.payerId,
            targetId: c.targetId,
            draftPayload: c.draftPayload,
        });
        if (got === want)
            return true;
    }
    return false;
}
async function emitRecommendationsForScope(prisma, periodStart, g, rows, evidenceBase, denialReasons) {
    let recommendationsCreated = 0;
    let suggestionsCreated = 0;
    const sample = rows.length;
    const denials = rows.filter((r) => r.outcome === "DENIED").length;
    const approvals = rows.filter((r) => r.outcome === "APPROVED").length;
    const denialRate = sample ? denials / sample : 0;
    const approvalRate = sample ? approvals / sample : 0;
    const evidenceWithPolicy = (rule, extra = {}) => ({
        ...evidenceBase,
        policy: {
            rule,
            explainable: true,
            noAutoApply: true,
            ...extra,
        },
    });
    if (denialRate >= 0.35 && sample >= 5) {
        const draftPayload = { playbookId: g.playbookId, playbookVersion: g.playbookVersion };
        if (!(await pendingDuplicateRecommendation(prisma, {
            recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.REVISE_PLAYBOOK,
            payerId: g.payerId,
            targetId: g.playbookId,
            draftPayload,
        }))) {
            await prisma.governanceRecommendation.create({
                data: {
                    payerId: g.payerId,
                    recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.REVISE_PLAYBOOK,
                    targetType: governance_constants_js_1.GOVERNANCE_TARGET_TYPE.PLAYBOOK,
                    targetId: g.playbookId,
                    draftPayload,
                    rationale: `Deterministic threshold: denial rate ${(denialRate * 100).toFixed(1)}% over ${sample} outcomes with this playbook version and scope. Draft playbook edits only — no automatic production change.`,
                    evidence: evidenceWithPolicy("denial_rate_revise_playbook"),
                    status: governance_constants_js_1.GOVERNANCE_STATUS.PENDING,
                },
            });
            recommendationsCreated += 1;
        }
    }
    if (approvalRate >= 0.85 && sample >= 10 && denialRate <= 0.1) {
        const draftPayload = { playbookId: g.playbookId, playbookVersion: g.playbookVersion };
        if (!(await pendingDuplicateRecommendation(prisma, {
            recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.PROMOTE_PLAYBOOK,
            payerId: g.payerId,
            targetId: g.playbookId,
            draftPayload,
        }))) {
            await prisma.governanceRecommendation.create({
                data: {
                    payerId: g.payerId,
                    recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.PROMOTE_PLAYBOOK,
                    targetType: governance_constants_js_1.GOVERNANCE_TARGET_TYPE.PLAYBOOK,
                    targetId: g.playbookId,
                    draftPayload,
                    rationale: `Strong observed approval rate ${(approvalRate * 100).toFixed(1)}% with low denials; consider elevating as template for narrower variants or onboarding.`,
                    evidence: evidenceWithPolicy("approval_rate_promote_playbook"),
                    status: governance_constants_js_1.GOVERNANCE_STATUS.PENDING,
                },
            });
            recommendationsCreated += 1;
        }
    }
    if (denialRate >= 0.45 && sample >= 8 && !g.hcpcsCode && !g.diagnosisCode) {
        const draftPayload = {
            playbookId: g.playbookId,
            playbookVersion: g.playbookVersion,
            reason: "Broad scope with elevated denials",
        };
        if (!(await pendingDuplicateRecommendation(prisma, {
            recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.CREATE_RULE,
            payerId: g.payerId,
            targetId: g.playbookId,
            draftPayload,
        }))) {
            await prisma.governanceRecommendation.create({
                data: {
                    payerId: g.payerId,
                    recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.CREATE_RULE,
                    targetType: governance_constants_js_1.GOVERNANCE_TARGET_TYPE.PLAYBOOK,
                    targetId: g.playbookId,
                    draftPayload,
                    rationale: "Observed denials on a coarse-grained playbook scope; recommendation is to draft narrower HCPCS/diagnosis variants after manual review.",
                    evidence: evidenceWithPolicy("broad_scope_create_rule"),
                    status: governance_constants_js_1.GOVERNANCE_STATUS.PENDING,
                },
            });
            recommendationsCreated += 1;
        }
    }
    const [topReason, topCount] = Object.entries(denialReasons).sort((a, b) => b[1] - a[1])[0] ?? [
        "",
        0,
    ];
    if (topReason && topCount >= 3) {
        const approvedManualRequirements = await prisma.manualRequirement.findMany({
            where: {
                payerId: g.payerId,
                active: true,
                reviewState: governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.APPROVED,
                OR: [{ planName: g.planName ?? null }, { planName: null }],
                AND: [
                    { OR: [{ deviceCategory: null }, { deviceCategory: g.deviceCategory ?? null }] },
                    { OR: [{ hcpcsCode: null }, { hcpcsCode: g.hcpcsCode ?? null }] },
                    { OR: [{ diagnosisCode: null }, { diagnosisCode: g.diagnosisCode ?? null }] },
                ],
            },
            select: { id: true },
            take: 50,
        });
        if (approvedManualRequirements.length === 0) {
            const suggestionKey = `denial_top:${(0, node_crypto_1.createHash)("sha256").update(topReason).digest("hex").slice(0, 24)}`;
            const already = await prisma.learnedRuleSuggestion.findFirst({
                where: {
                    payerId: g.payerId,
                    suggestionType: governance_constants_js_1.LEARNED_SUGGESTION_TYPE.DOC_REQUIREMENT_HINT,
                    suggestionKey,
                    status: governance_constants_js_1.LEARNED_SUGGESTION_STATUS.DRAFT,
                    createdAt: { gte: periodStart },
                },
                select: { id: true },
            });
            if (!already) {
                await prisma.learnedRuleSuggestion.create({
                    data: {
                        payerId: g.payerId,
                        planName: g.planName,
                        deviceCategory: g.deviceCategory,
                        hcpcsCode: g.hcpcsCode,
                        diagnosisCode: g.diagnosisCode,
                        suggestionType: governance_constants_js_1.LEARNED_SUGGESTION_TYPE.DOC_REQUIREMENT_HINT,
                        suggestionKey,
                        suggestionValue: {
                            summary: "Add payer-behavior or playbook hint referencing this denial pattern",
                            denialReasonSample: topReason.slice(0, 400),
                        },
                        evidence: {
                            ...evidenceWithPolicy("top_denial_reason_doc_hint"),
                            topReason,
                            topCount,
                        },
                        status: governance_constants_js_1.LEARNED_SUGGESTION_STATUS.DRAFT,
                    },
                });
                suggestionsCreated += 1;
            }
        }
    }
    if (denialRate >= 0.25 && sample >= 15) {
        const draftPayload = { direction: "DECREASE_BLOCKING_WEIGHT" };
        if (!(await pendingDuplicateRecommendation(prisma, {
            recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.ADJUST_SCORE_WEIGHT,
            payerId: g.payerId,
            targetId: null,
            draftPayload,
        }))) {
            await prisma.governanceRecommendation.create({
                data: {
                    payerId: g.payerId,
                    recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.ADJUST_SCORE_WEIGHT,
                    targetType: governance_constants_js_1.GOVERNANCE_TARGET_TYPE.SCORE_PROFILE,
                    targetId: null,
                    draftPayload,
                    rationale: "Elevated denials may indicate scoring gates are miscalibrated versus realized outcomes; propose manual review of payer rule weights (no auto-update).",
                    evidence: evidenceWithPolicy("denial_rate_adjust_score_weight"),
                    status: governance_constants_js_1.GOVERNANCE_STATUS.PENDING,
                },
            });
            recommendationsCreated += 1;
        }
    }
    if (denialRate >= 0.55 && sample >= 12) {
        const draftPayload = {
            playbookId: g.playbookId,
            playbookVersion: g.playbookVersion,
            note: "High sustained denial rate",
        };
        if (!(await pendingDuplicateRecommendation(prisma, {
            recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.RETIRE_PLAYBOOK,
            payerId: g.payerId,
            targetId: g.playbookId,
            draftPayload,
        }))) {
            await prisma.governanceRecommendation.create({
                data: {
                    payerId: g.payerId,
                    recommendationType: governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.RETIRE_PLAYBOOK,
                    targetType: governance_constants_js_1.GOVERNANCE_TARGET_TYPE.PLAYBOOK,
                    targetId: g.playbookId,
                    draftPayload,
                    rationale: "Deterministic threshold suggests drafting retirement or replacement after review — playbook remains active until a human implements a new version.",
                    evidence: evidenceWithPolicy("high_denial_retire_playbook"),
                    status: governance_constants_js_1.GOVERNANCE_STATUS.PENDING,
                },
            });
            recommendationsCreated += 1;
        }
    }
    return { recommendationsCreated, suggestionsCreated };
}
/**
 * Recomputes `PlaybookPerformance` for the window and opens governed recommendations (no prod mutations).
 */
async function runLearningEvaluation(prisma, params) {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - params.periodDays * 86400000);
    const outcomes = await prisma.authorizationOutcome.findMany({
        where: {
            createdAt: { gte: periodStart, lte: periodEnd },
            playbookId: { not: null },
            playbookVersion: { not: null },
            ...(params.payerId ? { payerId: params.payerId } : {}),
        },
    });
    const groups = new Map();
    for (const o of outcomes) {
        if (!o.playbookId || o.playbookVersion == null)
            continue;
        const base = {
            playbookId: o.playbookId,
            playbookVersion: o.playbookVersion,
            payerId: o.payerId,
            planName: o.planName ?? null,
            deviceCategory: o.deviceCategory ?? null,
            hcpcsCode: o.hcpcsCode ?? null,
            diagnosisCode: o.diagnosisCode ?? null,
        };
        const k = scopeKey(base);
        const g = groups.get(k);
        if (g)
            g.rows.push(o);
        else
            groups.set(k, { ...base, rows: [o] });
    }
    let performanceRows = 0;
    let recommendationsCreated = 0;
    let suggestionsCreated = 0;
    for (const g of groups.values()) {
        const { rows } = g;
        const { playbookId, playbookVersion, payerId, planName, deviceCategory, hcpcsCode, diagnosisCode } = g;
        const groupHead = {
            playbookId,
            playbookVersion,
            payerId,
            planName,
            deviceCategory,
            hcpcsCode,
            diagnosisCode,
        };
        const rollup = await (0, playbookPerformance_service_js_1.persistPlaybookPerformanceSnapshot)(prisma, groupHead, rows);
        performanceRows += 1;
        const evidenceBase = (0, learningEvidence_service_js_1.buildPerformanceEvidenceJson)(periodStart, periodEnd, groupHead, rows, rollup);
        const emit = await emitRecommendationsForScope(prisma, periodStart, groupHead, rows, evidenceBase, rollup.denialReasons);
        recommendationsCreated += emit.recommendationsCreated;
        suggestionsCreated += emit.suggestionsCreated;
    }
    await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
        action: "governance_learning_evaluated",
        payerId: params.payerId ?? null,
        detail: {
            periodDays: params.periodDays,
            performanceRows,
            recommendationsCreated,
            suggestionsCreated,
        },
        actor: params.actor,
    });
    return {
        performanceRows,
        recommendationsCreated,
        suggestionsCreated,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
    };
}
class RecommendationEngineService {
    db;
    constructor(db = prisma_js_1.prisma) {
        this.db = db;
    }
    /**
     * Evaluates a playbook performance snapshot and creates a governance recommendation (queue item only).
     * Returns `null` when thresholds aren't met.
     */
    async evaluatePlaybook(playbookId, version) {
        const perf = await this.db.playbookPerformance.findFirst({
            where: { playbookId, version },
            orderBy: { calculatedAt: "desc" },
        });
        if (!perf || perf.totalCases < 10)
            return null;
        const approvalRate = perf.totalCases > 0 ? perf.approvals / perf.totalCases : 0;
        const draftPayload = approvalRate >= 0.85
            ? { playbookId, version, action: "promote" }
            : approvalRate < 0.5
                ? { playbookId, version, action: "revise" }
                : null;
        if (!draftPayload)
            return null;
        const recommendationType = approvalRate >= 0.85
            ? governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.PROMOTE_PLAYBOOK
            : governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.REVISE_PLAYBOOK;
        // Best-effort dedupe to avoid queue spam.
        const shouldCreate = !(await pendingDuplicateRecommendation(this.db, {
            recommendationType,
            payerId: perf.payerId,
            targetId: playbookId,
            draftPayload,
        }));
        if (!shouldCreate)
            return null;
        const policyRule = recommendationType === governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.PROMOTE_PLAYBOOK
            ? "approval_rate_promote_playbook"
            : "approval_rate_revise_playbook";
        return this.db.governanceRecommendation.create({
            data: {
                payerId: perf.payerId,
                recommendationType,
                targetId: playbookId,
                targetType: governance_constants_js_1.GOVERNANCE_TARGET_TYPE.PLAYBOOK,
                draftPayload: draftPayload,
                evidence: {
                    references: { playbookPerformanceId: perf.id },
                    totalCases: perf.totalCases,
                    approvalRate,
                    avgTurnaroundDays: perf.avgTurnaroundDays ?? null,
                    denialReasons: perf.denialReasons,
                    policy: {
                        explainable: true,
                        noAutoApply: true,
                        rule: policyRule,
                    },
                },
                rationale: `Playbook version ${version} meets ${approvalRate >= 0.85 ? "promotion" : "revision"} threshold with ${Math.round(approvalRate * 100)}% approval over ${perf.totalCases} cases.`,
                status: governance_constants_js_1.GOVERNANCE_STATUS.PENDING,
            },
        });
    }
    async createRuleSuggestionFromOutcomes(input) {
        const denialHash = (0, node_crypto_1.createHash)("sha256")
            .update(input.repeatedDenialReason, "utf8")
            .digest("hex")
            .slice(0, 24);
        const suggestionKey = `denial_pattern:${denialHash}`;
        const approvedManualRequirement = await this.db.manualRequirement.findFirst({
            where: {
                payerId: input.payerId,
                active: true,
                reviewState: governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.APPROVED,
                OR: [{ planName: input.pattern.planName ?? null }, { planName: null }],
                AND: [
                    { OR: [{ deviceCategory: null }, { deviceCategory: input.pattern.deviceCategory ?? null }] },
                    { OR: [{ hcpcsCode: null }, { hcpcsCode: input.pattern.hcpcsCode ?? null }] },
                    {
                        OR: [
                            { diagnosisCode: null },
                            { diagnosisCode: input.pattern.diagnosisCode ?? null },
                        ],
                    },
                ],
            },
            select: { id: true },
        });
        if (approvedManualRequirement)
            return null;
        const existing = await this.db.learnedRuleSuggestion.findFirst({
            where: {
                payerId: input.payerId,
                suggestionType: governance_constants_js_1.LEARNED_SUGGESTION_TYPE.DOC_REQUIREMENT_HINT,
                suggestionKey,
                status: governance_constants_js_1.LEARNED_SUGGESTION_STATUS.DRAFT,
            },
            select: { id: true },
        });
        if (existing)
            return existing;
        return this.db.learnedRuleSuggestion.create({
            data: {
                payerId: input.payerId,
                planName: input.pattern.planName ?? null,
                deviceCategory: input.pattern.deviceCategory ?? null,
                hcpcsCode: input.pattern.hcpcsCode ?? null,
                diagnosisCode: input.pattern.diagnosisCode ?? null,
                suggestionType: governance_constants_js_1.LEARNED_SUGGESTION_TYPE.DOC_REQUIREMENT_HINT,
                suggestionKey,
                suggestionValue: {
                    repeatedDenialReason: input.repeatedDenialReason,
                    proposedAction: "add_requirement_or_playbook_revision",
                },
                evidence: input.evidence,
                status: governance_constants_js_1.LEARNED_SUGGESTION_STATUS.DRAFT,
            },
        });
    }
}
exports.RecommendationEngineService = RecommendationEngineService;
exports.recommendationEngineService = new RecommendationEngineService();
//# sourceMappingURL=recommendationEngine.service.js.map