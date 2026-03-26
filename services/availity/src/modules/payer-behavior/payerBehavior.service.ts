import type { PrismaClient } from "@prisma/client";
import type { PayerRule } from "@prisma/client";
import { audit } from "../../lib/audit.js";
import { prisma as appPrisma } from "../../lib/prisma.js";
import { writePayerIntelligenceAudit } from "../../lib/payer-intelligence-audit.js";
import { parseDocumentRefs } from "../packet/packet-hydrate.js";
import {
  applyPayerBehaviorRules,
  fullRuleToMatched,
  payerRuleMatchesInput,
} from "./payerBehavior.rules.js";
import { createPayerBehaviorStatsService } from "./payerBehavior.stats.service.js";
import type {
  CreatePayerRuleBody,
  IngestOutcomeBody,
  ScorePriorAuthBody,
} from "./payerBehavior.schemas.js";
import type {
  PayerRuleRecord,
  ScoreCaseInput,
  ScoreCaseResult,
  ScoreComputationInput,
} from "./payerBehavior.types.js";
import { MANUAL_REQUIREMENT_REVIEW_STATE } from "../governance/governance.constants.js";

function mapRule(r: PayerRule): PayerRuleRecord {
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

async function inferDocsFromPacket(
  prisma: PrismaClient,
  packetId: string,
): Promise<{ hasLmn: boolean; hasSwo: boolean; hasClinicals: boolean }> {
  const packet = await prisma.priorAuthPacket.findUnique({
    where: { id: packetId },
  });
  if (!packet) return { hasLmn: false, hasSwo: false, hasClinicals: false };
  const ids = parseDocumentRefs(packet.documents);
  if (ids.length === 0) return { hasLmn: false, hasSwo: false, hasClinicals: false };
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

function primaryDiagnosisCode(body: IngestOutcomeBody): string | null {
  if (body.diagnosisCode?.trim()) return body.diagnosisCode.trim();
  const first = body.diagnosisCodes?.find((c) => c.trim());
  return first?.trim() ?? null;
}

function diagnosisListFromScoreBody(body: ScorePriorAuthBody): string[] {
  const out: string[] = [];
  if (body.diagnosisCode?.trim()) out.push(body.diagnosisCode.trim());
  for (const c of body.diagnosisCodes ?? []) {
    const t = c.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function scoreCaseInputToComputationInput(input: ScoreCaseInput): ScoreComputationInput {
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

export class PayerBehaviorService {
  private readonly statsService;

  constructor(private readonly prisma: PrismaClient) {
    this.statsService = createPayerBehaviorStatsService(prisma);
  }

  /**
   * Score using persisted rules (plan-global + plan-specific) and stats for the same scope as `getStats`.
   */
  async scoreCase(
    input: ScoreCaseInput,
    actor: string = "system",
  ): Promise<{
    snapshotId: string;
    score: ScoreCaseResult;
  }> {
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
    const scoped = records.filter((r) => payerRuleMatchesInput(r, computationInput));
    const matchedRules = scoped.map(fullRuleToMatched);

    const diagnosisCode = input.diagnosisCode?.trim() || undefined;
    const stats = await this.statsService.getStats({
      payerId: input.payerId,
      planName: input.planName,
      deviceCategory: input.deviceCategory,
      hcpcsCode: input.hcpcsCode,
      diagnosisCode,
    });

    const result = applyPayerBehaviorRules(input, matchedRules, stats);

    const snapshot = await this.prisma.payerScoreSnapshot.create({
      data: {
        caseId: input.caseId ?? null,
        payerId: input.payerId,
        approvalProbability: result.approvalProbability,
        riskLevel: result.riskLevel,
        predictedDenialReasons: result.predictedDenialReasons as object,
        missingRequirements: result.missingRequirements as object,
        recommendedAction: result.recommendedAction,
        explanation: result.explanation as object,
      },
    });

    await audit({
      caseId: input.caseId ?? null,
      action: "payer_behavior_score",
      endpoint: "/api/intelligence/payer/score",
      requestPayload: input,
      responsePayload: result,
      httpStatus: 200,
      actor,
    });

    await writePayerIntelligenceAudit(this.prisma, {
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

  async scorePriorAuth(
    body: ScorePriorAuthBody,
    actor: string,
  ): Promise<{ snapshot: { id: string }; score: ScoreCaseResult }> {
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

    const scoreCaseInput: ScoreCaseInput = {
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

  async ingestOutcome(body: IngestOutcomeBody, actor: string) {
    const dx = primaryDiagnosisCode(body);
    let turnaroundDays = body.turnaroundDays ?? null;
    if (turnaroundDays == null && body.submittedAt && body.resolvedAt) {
      turnaroundDays = Math.max(
        0,
        Math.round(
          (new Date(body.resolvedAt).getTime() - new Date(body.submittedAt).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );
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
    const scoreSnapshotId =
      body.caseId
        ? (
            await this.prisma.payerScoreSnapshot.findFirst({
              where: { caseId: body.caseId, payerId: body.payerId },
              orderBy: { createdAt: "desc" },
              select: { id: true },
            })
          )?.id ?? null
        : null;

    const manualRequirementsInForce = await this.prisma.manualRequirement.findMany({
      where: {
        payerId: body.payerId,
        active: true,
        reviewState: MANUAL_REQUIREMENT_REVIEW_STATE.APPROVED,
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
      ...(body.payerRuleSnapshot ? (body.payerRuleSnapshot as object) : {}),
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
        payerRuleSnapshot: payerRuleSnapshotMerged as object,
      },
    });

    await writePayerIntelligenceAudit(this.prisma, {
      action: "outcome_ingested",
      payerId: body.payerId,
      caseId: body.caseId ?? null,
      outcomeId: row.id,
      detail: { outcome: body.outcome },
      actor,
    });

    return row;
  }

  async listRules(payerId: string) {
    return this.prisma.payerRule.findMany({
      where: { payerId, active: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async createRule(body: CreatePayerRuleBody, actor: string) {
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

    await writePayerIntelligenceAudit(this.prisma, {
      action: "rule_created",
      payerId: body.payerId,
      detail: { ruleId: row.id },
      actor,
    });

    return row;
  }
}

export function createPayerBehaviorService(prisma: PrismaClient): PayerBehaviorService {
  return new PayerBehaviorService(prisma);
}

export const payerBehaviorService = new PayerBehaviorService(appPrisma);
