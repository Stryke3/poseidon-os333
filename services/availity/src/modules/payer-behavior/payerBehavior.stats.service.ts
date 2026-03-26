import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../lib/prisma.js";
import type { PayerBehaviorStats } from "./payerBehavior.types.js";

export type PayerBehaviorStatsQuery = {
  payerId: string;
  planName?: string;
  deviceCategory?: string;
  hcpcsCode?: string;
  diagnosisCode?: string;
};

/** Pure aggregation (used by {@link PayerBehaviorStatsService.getStats} and tests). */
export function aggregateAuthorizationOutcomes(
  outcomes: Array<{ outcome: string; denialReason: string | null }>,
): PayerBehaviorStats {
  const total = outcomes.length;
  const approved = outcomes.filter((o) => o.outcome === "APPROVED").length;
  const denied = outcomes.filter((o) => o.outcome === "DENIED").length;
  const approvalRate = total > 0 ? approved / total : 0;

  const reasonCounts = new Map<string, number>();
  for (const outcome of outcomes) {
    if (outcome.denialReason) {
      reasonCounts.set(
        outcome.denialReason,
        (reasonCounts.get(outcome.denialReason) ?? 0) + 1,
      );
    }
  }

  const topDenialReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason]) => reason);

  return {
    total,
    approved,
    denied,
    approvalRate,
    topDenialReasons,
  };
}

export class PayerBehaviorStatsService {
  constructor(private readonly db: PrismaClient) {}

  async getStats(input: PayerBehaviorStatsQuery): Promise<PayerBehaviorStats> {
    const outcomes = await this.db.authorizationOutcome.findMany({
      where: {
        payerId: input.payerId,
        ...(input.planName ? { planName: input.planName } : {}),
        ...(input.deviceCategory ? { deviceCategory: input.deviceCategory } : {}),
        ...(input.hcpcsCode ? { hcpcsCode: input.hcpcsCode } : {}),
        ...(input.diagnosisCode ? { diagnosisCode: input.diagnosisCode } : {}),
      },
      take: 1000,
      orderBy: { createdAt: "desc" },
    });

    return aggregateAuthorizationOutcomes(outcomes);
  }
}

export function createPayerBehaviorStatsService(p: PrismaClient): PayerBehaviorStatsService {
  return new PayerBehaviorStatsService(p);
}

/** Shared app client — single Prisma instance. */
export const payerBehaviorStatsService = new PayerBehaviorStatsService(defaultPrisma);
