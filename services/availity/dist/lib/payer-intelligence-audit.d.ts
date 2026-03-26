import type { Prisma, PrismaClient } from "@prisma/client";
export declare function writePayerIntelligenceAudit(prisma: PrismaClient | Prisma.TransactionClient, entry: {
    action: string;
    payerId?: string | null;
    caseId?: string | null;
    snapshotId?: string | null;
    outcomeId?: string | null;
    detail?: unknown;
    actor?: string | null;
}): Promise<void>;
//# sourceMappingURL=payer-intelligence-audit.d.ts.map