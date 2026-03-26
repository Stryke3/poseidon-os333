import type { PrismaClient } from "@prisma/client";
import { writePayerIntelligenceAudit } from "../../lib/payer-intelligence-audit.js";
import { GOVERNANCE_DECISION_VALUE, GOVERNANCE_STATUS } from "./governance.constants.js";

export async function approveGovernanceRecommendation(
  prisma: PrismaClient,
  recommendationId: string,
  decidedBy: string,
  notes?: string,
) {
  const rec = await prisma.governanceRecommendation.findUnique({ where: { id: recommendationId } });
  if (!rec) throw new Error("RECOMMENDATION_NOT_FOUND");
  if (rec.status !== GOVERNANCE_STATUS.PENDING) {
    throw new Error("RECOMMENDATION_NOT_PENDING");
  }

  await prisma.$transaction([
    prisma.governanceDecision.create({
      data: {
        recommendationId,
        decision: GOVERNANCE_DECISION_VALUE.APPROVED,
        decidedBy,
        notes: notes ?? null,
      },
    }),
    prisma.governanceRecommendation.update({
      where: { id: recommendationId },
      data: { status: GOVERNANCE_STATUS.APPROVED },
    }),
  ]);

  await writePayerIntelligenceAudit(prisma, {
    action: "governance_recommendation_approved",
    detail: {
      recommendationId,
      recommendationType: rec.recommendationType,
      draftPayload: rec.draftPayload,
      note: "Approval records intent only; production playbooks and payer rules are not modified automatically.",
    },
    actor: decidedBy,
  });

  return { success: true as const, recommendationId };
}

export async function rejectGovernanceRecommendation(
  prisma: PrismaClient,
  recommendationId: string,
  decidedBy: string,
  notes?: string,
) {
  const rec = await prisma.governanceRecommendation.findUnique({ where: { id: recommendationId } });
  if (!rec) throw new Error("RECOMMENDATION_NOT_FOUND");
  if (rec.status !== GOVERNANCE_STATUS.PENDING) {
    throw new Error("RECOMMENDATION_NOT_PENDING");
  }

  await prisma.$transaction([
    prisma.governanceDecision.create({
      data: {
        recommendationId,
        decision: GOVERNANCE_DECISION_VALUE.REJECTED,
        decidedBy,
        notes: notes ?? null,
      },
    }),
    prisma.governanceRecommendation.update({
      where: { id: recommendationId },
      data: { status: GOVERNANCE_STATUS.REJECTED },
    }),
  ]);

  await writePayerIntelligenceAudit(prisma, {
    action: "governance_recommendation_rejected",
    detail: { recommendationId, recommendationType: rec.recommendationType },
    actor: decidedBy,
  });

  return { success: true as const, recommendationId };
}
