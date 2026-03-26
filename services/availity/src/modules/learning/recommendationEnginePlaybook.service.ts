import { createHash } from "node:crypto";
import type { GovernanceRecommendation, LearnedRuleSuggestion, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  GOVERNANCE_RECOMMENDATION_TYPE,
  GOVERNANCE_STATUS,
  GOVERNANCE_TARGET_TYPE,
  LEARNED_SUGGESTION_STATUS,
  LEARNED_SUGGESTION_TYPE,
  MANUAL_REQUIREMENT_REVIEW_STATE,
} from "../governance/governance.constants.js";
import { pendingDuplicateRecommendation } from "./recommendationEngine.service.js";

export type RuleSuggestionFromOutcomesInput = {
  payerId: string;
  pattern: {
    planName?: string;
    deviceCategory?: string;
    hcpcsCode?: string;
    diagnosisCode?: string;
  };
  repeatedDenialReason: string;
  evidence: Prisma.InputJsonValue;
};

/**
 * Playbook-scoped recommendation helpers driven by latest `PlaybookPerformance` snapshot.
 * Uses the same PENDING dedupe semantics as the batch learning evaluator.
 */
export class RecommendationEngineService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Evaluates the most recent performance row for `(playbookId, version)` and may open
   * a single governance recommendation. Returns null if sample is too small or no rule fires.
   */
  async evaluatePlaybook(
    playbookId: string,
    version: number,
  ): Promise<GovernanceRecommendation | null> {
    const perf = await this.db.playbookPerformance.findFirst({
      where: { playbookId, version },
      orderBy: { calculatedAt: "desc" },
    });

    if (!perf || perf.totalCases < 10) {
      return null;
    }

    const approvalRate = perf.totalCases > 0 ? perf.approvals / perf.totalCases : 0;

    if (approvalRate >= 0.85) {
      const draftPayload: Prisma.InputJsonValue = {
        playbookId,
        version,
        action: "promote",
      };
      if (
        await pendingDuplicateRecommendation(this.db, {
          recommendationType: GOVERNANCE_RECOMMENDATION_TYPE.PROMOTE_PLAYBOOK,
          payerId: perf.payerId,
          targetId: playbookId,
          draftPayload: draftPayload as Prisma.JsonValue,
        })
      ) {
        return null;
      }
      const evidence: Prisma.InputJsonValue = {
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
          recommendationType: GOVERNANCE_RECOMMENDATION_TYPE.PROMOTE_PLAYBOOK,
          targetId: playbookId,
          targetType: GOVERNANCE_TARGET_TYPE.PLAYBOOK,
          draftPayload,
          evidence,
          rationale: `Playbook version ${version} exceeds promotion threshold with ${Math.round(approvalRate * 100)}% approval over ${perf.totalCases} cases.`,
          status: GOVERNANCE_STATUS.PENDING,
        },
      });
    }

    if (approvalRate < 0.5) {
      const draftPayload: Prisma.InputJsonValue = {
        playbookId,
        version,
        action: "revise",
      };
      if (
        await pendingDuplicateRecommendation(this.db, {
          recommendationType: GOVERNANCE_RECOMMENDATION_TYPE.REVISE_PLAYBOOK,
          payerId: perf.payerId,
          targetId: playbookId,
          draftPayload: draftPayload as Prisma.JsonValue,
        })
      ) {
        return null;
      }
      const evidence: Prisma.InputJsonValue = {
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
          recommendationType: GOVERNANCE_RECOMMENDATION_TYPE.REVISE_PLAYBOOK,
          targetId: playbookId,
          targetType: GOVERNANCE_TARGET_TYPE.PLAYBOOK,
          draftPayload,
          evidence,
          rationale: `Playbook version ${version} is underperforming with ${Math.round(approvalRate * 100)}% approval.`,
          status: GOVERNANCE_STATUS.PENDING,
        },
      });
    }

    return null;
  }

  async createRuleSuggestionFromOutcomes(
    input: RuleSuggestionFromOutcomesInput,
  ): Promise<LearnedRuleSuggestion> {
    const approvedManualRequirement = await this.db.manualRequirement.findFirst({
      where: {
        payerId: input.payerId,
        active: true,
        reviewState: MANUAL_REQUIREMENT_REVIEW_STATE.APPROVED,
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

    const suggestionKey = `denial_pattern:${createHash("sha256").update(input.repeatedDenialReason).digest("hex").slice(0, 24)}`;
    const suggestionValue: Prisma.InputJsonValue = {
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
        suggestionType: LEARNED_SUGGESTION_TYPE.DOC_REQUIREMENT_HINT,
        suggestionKey,
        suggestionValue,
        evidence: {
          ...(input.evidence as object),
          policy: {
            explainable: true,
            noAutoApply: true,
            manualApprovedGuard: true,
          },
        },
        status: LEARNED_SUGGESTION_STATUS.DRAFT,
      },
    });
  }
}

export const recommendationEngineService = new RecommendationEngineService(prisma);
