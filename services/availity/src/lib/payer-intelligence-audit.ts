import type { Prisma, PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";

export async function writePayerIntelligenceAudit(
  prisma: PrismaClient | Prisma.TransactionClient,
  entry: {
    action: string;
    payerId?: string | null;
    caseId?: string | null;
    snapshotId?: string | null;
    outcomeId?: string | null;
    detail?: unknown;
    actor?: string | null;
  },
): Promise<void> {
  await prisma.payerIntelligenceAuditLog.create({
    data: {
      action: entry.action,
      payerId: entry.payerId ?? null,
      caseId: entry.caseId ?? null,
      snapshotId: entry.snapshotId ?? null,
      outcomeId: entry.outcomeId ?? null,
      detailJson: entry.detail === undefined ? undefined : (entry.detail as object),
      actor: entry.actor ?? "system",
    },
  });

  logger.info(
    {
      payerIntelligenceAudit: true,
      action: entry.action,
      payerId: entry.payerId,
      caseId: entry.caseId,
      snapshotId: entry.snapshotId,
      actor: entry.actor ?? "system",
    },
    "payer_intelligence_audit",
  );
}
