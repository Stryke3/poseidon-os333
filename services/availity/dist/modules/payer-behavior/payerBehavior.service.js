"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payerBehaviorService = exports.PayerBehaviorService = void 0;
exports.createPayerBehaviorService = createPayerBehaviorService;
const audit_js_1 = require("../../lib/audit.js");
const prisma_js_1 = require("../../lib/prisma.js");
const payer_intelligence_audit_js_1 = require("../../lib/payer-intelligence-audit.js");
const packet_hydrate_js_1 = require("../packet/packet-hydrate.js");
const payerBehavior_rules_js_1 = require("./payerBehavior.rules.js");
const payerBehavior_stats_service_js_1 = require("./payerBehavior.stats.service.js");
const governance_constants_js_1 = require("../governance/governance.constants.js");
function mapRule(r) {
    return {
        id: r.id,
        payerId: r.payerId,
        planName: r.planName,
        deviceCategory: r.deviceCategory,
        hcpcsCode: r.hcpcsCode,
        diagnosisCode: r.diagnosisCode,
        requiresLmn: r.requiresLmn,
        requiresSwo: r.requiresSwo,
        requiresClinicals: r.requiresClinicals,
        requiresAuth: r.requiresAuth,
        notes: r.notes,
        active: r.active,
    };
}
async function inferDocsFromPacket(prisma, packetId) {
    const packet = await prisma.priorAuthPacket.findUnique({
        where: { id: packetId },
    });
    if (!packet)
        return { hasLmn: false, hasSwo: false, hasClinicals: false };
    const ids = (0, packet_hydrate_js_1.parseDocumentRefs)(packet.documents);
    if (ids.length === 0)
        return { hasLmn: false, hasSwo: false, hasClinicals: false };
    const docs = await prisma.priorAuthDocument.findMany({
        where: { id: { in: ids } },
        select: { type: true },
    });
    const types = new Set(docs.map((d) => d.type));
    return {
        hasLmn: types.has("LMN"),
        hasSwo: types.has("SWO"),
        hasClinicals: types.has("CLINICAL_SUMMARY"),
    };
}
function primaryDiagnosisCode(body) {
    if (body.diagnosisCode?.trim())
        return body.diagnosisCode.trim();
    const first = body.diagnosisCodes?.find((c) => c.trim());
    return first?.trim() ?? null;
}
function diagnosisListFromScoreBody(body) {
    const out = [];
    if (body.diagnosisCode?.trim())
        out.push(body.diagnosisCode.trim());
    for (const c of body.diagnosisCodes ?? []) {
        const t = c.trim();
        if (t && !out.includes(t))
            out.push(t);
    }
    return out;
}
function scoreCaseInputToComputationInput(input) {
    const dx = input.diagnosisCode?.trim();
    return {
        payerId: input.payerId,
        planName: input.planName,
        deviceCategory: input.deviceCategory,
        hcpcsCode: input.hcpcsCode,
        diagnosisCodes: dx ? [dx] : [],
        hasLmn: input.hasLmn,
        hasSwo: input.hasSwo,
        hasClinicals: input.hasClinicals,
    };
}
class PayerBehaviorService {
    prisma;
    statsService;
    constructor(prisma) {
        this.prisma = prisma;
        this.statsService = (0, payerBehavior_stats_service_js_1.createPayerBehaviorStatsService)(prisma);
    }
    /**
     * Score using persisted rules (plan-global + plan-specific) and stats for the same scope as `getStats`.
     */
    async scoreCase(input, actor = "system") {
        if (input.caseId) {
            const c = await this.prisma.case.findUnique({ where: { id: input.caseId } });
            if (!c) {
                throw new Error("CASE_NOT_FOUND");
            }
        }
        const computationInput = scoreCaseInputToComputationInput(input);
        const planOr = input.planName?.trim()
            ? [{ planName: input.planName.trim() }, { planName: null }]
            : [{ planName: null }];
        const dbRules = await this.prisma.payerRule.findMany({
            where: {
                payerId: input.payerId,
                active: true,
                OR: planOr,
            },
        });
        const records = dbRules.map(mapRule);
        const scoped = records.filter((r) => (0, payerBehavior_rules_js_1.payerRuleMatchesInput)(r, computationInput));
        const matchedRules = scoped.map(payerBehavior_rules_js_1.fullRuleToMatched);
        const diagnosisCode = input.diagnosisCode?.trim() || undefined;
        const stats = await this.statsService.getStats({
            payerId: input.payerId,
            planName: input.planName,
            deviceCategory: input.deviceCategory,
            hcpcsCode: input.hcpcsCode,
            diagnosisCode,
        });
        const result = (0, payerBehavior_rules_js_1.applyPayerBehaviorRules)(input, matchedRules, stats);
        const snapshot = await this.prisma.payerScoreSnapshot.create({
            data: {
                caseId: input.caseId ?? null,
                payerId: input.payerId,
                approvalProbability: result.approvalProbability,
                riskLevel: result.riskLevel,
                predictedDenialReasons: result.predictedDenialReasons,
                missingRequirements: result.missingRequirements,
                recommendedAction: result.recommendedAction,
                explanation: result.explanation,
            },
        });
        await (0, audit_js_1.audit)({
            caseId: input.caseId ?? null,
            action: "payer_behavior_score",
            endpoint: "/api/intelligence/payer/score",
            requestPayload: input,
            responsePayload: result,
            httpStatus: 200,
            actor,
        });
        await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(this.prisma, {
            action: "score_generated",
            payerId: input.payerId,
            caseId: input.caseId ?? null,
            snapshotId: snapshot.id,
            detail: {
                approvalProbability: result.approvalProbability,
                riskLevel: result.riskLevel,
                blockSubmission: result.workflow.blockSubmission,
            },
            actor,
        });
        return { snapshotId: snapshot.id, score: result };
    }
    async scorePriorAuth(body, actor) {
        if (body.caseId) {
            const c = await this.prisma.case.findUnique({ where: { id: body.caseId } });
            if (!c) {
                throw new Error("CASE_NOT_FOUND");
            }
        }
        let hasLmn = body.hasLmn ?? false;
        let hasSwo = body.hasSwo ?? false;
        let hasClinicals = body.hasClinicals ?? false;
        if (body.packetId) {
            const inferred = await inferDocsFromPacket(this.prisma, body.packetId);
            hasLmn = hasLmn || inferred.hasLmn;
            hasSwo = hasSwo || inferred.hasSwo;
            hasClinicals = hasClinicals || inferred.hasClinicals;
        }
        const hcpcsCode = (body.hcpcsCode ?? body.hcpcs)?.trim() || undefined;
        const dxList = diagnosisListFromScoreBody(body);
        const scoreCaseInput = {
            caseId: body.caseId,
            payerId: body.payerId,
            planName: body.planName,
            deviceCategory: body.deviceCategory,
            hcpcsCode,
            diagnosisCode: body.diagnosisCode?.trim() || dxList[0],
            physicianName: body.physicianName,
            facilityName: body.facilityName,
            hasLmn,
            hasSwo,
            hasClinicals,
        };
        const { snapshotId, score } = await this.scoreCase(scoreCaseInput, actor);
        return { snapshot: { id: snapshotId }, score };
    }
    async ingestOutcome(body, actor) {
        const dx = primaryDiagnosisCode(body);
        let turnaroundDays = body.turnaroundDays ?? null;
        if (turnaroundDays == null && body.submittedAt && body.resolvedAt) {
            turnaroundDays = Math.max(0, Math.round((new Date(body.resolvedAt).getTime() - new Date(body.submittedAt).getTime()) /
                (1000 * 60 * 60 * 24)));
        }
        let playbookExecutionId = body.playbookExecutionId ?? null;
        let playbookId = body.playbookId ?? null;
        let playbookVersion = body.playbookVersion ?? null;
        if (!playbookExecutionId && body.caseId) {
            const ex = await this.prisma.playbookExecution.findFirst({
                where: { caseId: body.caseId, playbookId: { not: null } },
                orderBy: { createdAt: "desc" },
            });
            if (ex?.playbookId) {
                playbookExecutionId = ex.id;
                playbookId = ex.playbookId;
                playbookVersion = ex.version;
            }
        }
        const planName = body.planName ?? null;
        const deviceCategory = body.deviceCategory ?? null;
        const hcpcsCode = body.hcpcsCode?.trim() || body.hcpcs?.trim() || null;
        const diagnosisCode = dx;
        // Tie the ingested outcome to score + manual requirements in-force so downstream learning
        // evidence can reference exactly what was applied at time of outcome resolution.
        const scoreSnapshotId = body.caseId
            ? (await this.prisma.payerScoreSnapshot.findFirst({
                where: { caseId: body.caseId, payerId: body.payerId },
                orderBy: { createdAt: "desc" },
                select: { id: true },
            }))?.id ?? null
            : null;
        const manualRequirementsInForce = await this.prisma.manualRequirement.findMany({
            where: {
                payerId: body.payerId,
                active: true,
                reviewState: governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.APPROVED,
                OR: [{ planName }, { planName: null }],
                AND: [
                    { OR: [{ deviceCategory: null }, { deviceCategory }] },
                    { OR: [{ hcpcsCode: null }, { hcpcsCode }] },
                    { OR: [{ diagnosisCode: null }, { diagnosisCode }] },
                ],
            },
            select: { id: true },
        });
        const payerRuleSnapshotMerged = {
            ...(body.payerRuleSnapshot ? body.payerRuleSnapshot : {}),
            scoreSnapshotId,
            manualRequirementIdsInForce: manualRequirementsInForce.map((r) => r.id),
        };
        const row = await this.prisma.authorizationOutcome.create({
            data: {
                caseId: body.caseId ?? null,
                payerId: body.payerId,
                planName,
                deviceCategory,
                hcpcsCode,
                diagnosisCode,
                physicianName: body.physicianName ?? null,
                facilityName: body.facilityName ?? null,
                outcome: body.outcome,
                denialReason: body.denialReason ?? null,
                turnaroundDays,
                submittedAt: body.submittedAt ? new Date(body.submittedAt) : null,
                resolvedAt: body.resolvedAt ? new Date(body.resolvedAt) : null,
                playbookExecutionId,
                playbookId,
                playbookVersion,
                payerRuleSnapshot: payerRuleSnapshotMerged,
            },
        });
        await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(this.prisma, {
            action: "outcome_ingested",
            payerId: body.payerId,
            caseId: body.caseId ?? null,
            outcomeId: row.id,
            detail: { outcome: body.outcome },
            actor,
        });
        return row;
    }
    async listRules(payerId) {
        return this.prisma.payerRule.findMany({
            where: { payerId, active: true },
            orderBy: { createdAt: "desc" },
        });
    }
    async createRule(body, actor) {
        const row = await this.prisma.payerRule.create({
            data: {
                payerId: body.payerId,
                planName: body.planName ?? null,
                deviceCategory: body.deviceCategory ?? null,
                hcpcsCode: body.hcpcsCode ?? null,
                diagnosisCode: body.diagnosisCode ?? null,
                requiresLmn: body.requiresLmn ?? false,
                requiresSwo: body.requiresSwo ?? false,
                requiresClinicals: body.requiresClinicals ?? false,
                requiresAuth: body.requiresAuth ?? true,
                notes: body.notes ?? null,
                active: body.active ?? true,
            },
        });
        await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(this.prisma, {
            action: "rule_created",
            payerId: body.payerId,
            detail: { ruleId: row.id },
            actor,
        });
        return row;
    }
}
exports.PayerBehaviorService = PayerBehaviorService;
function createPayerBehaviorService(prisma) {
    return new PayerBehaviorService(prisma);
}
exports.payerBehaviorService = new PayerBehaviorService(prisma_js_1.prisma);
//# sourceMappingURL=payerBehavior.service.js.map