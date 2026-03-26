import type { AuthorizationOutcome } from "@prisma/client";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { OutcomeScopeGroup } from "./learning.types.js";
export type OutcomeRollup = {
    approvals: number;
    denials: number;
    pended: number;
    denialReasons: Record<string, number>;
    avgTurnaroundDays: number | null;
    reworkCount: number;
};
export declare function rollupAuthorizationOutcomes(rows: AuthorizationOutcome[]): OutcomeRollup;
export declare function persistPlaybookPerformanceSnapshot(prisma: PrismaClient, group: Omit<OutcomeScopeGroup, "rows">, rows: AuthorizationOutcome[]): Promise<OutcomeRollup>;
export declare class PlaybookPerformanceService {
    private readonly db;
    constructor(db?: PrismaClient);
    recompute(playbookId: string, version: number): Promise<{
        payerId: string;
        id: string;
        version: number;
        planName: string | null;
        deviceCategory: string | null;
        hcpcsCode: string | null;
        diagnosisCode: string | null;
        playbookId: string;
        totalCases: number;
        approvals: number;
        denials: number;
        pended: number;
        avgTurnaroundDays: number | null;
        reworkCount: number;
        denialReasons: Prisma.JsonValue;
        calculatedAt: Date;
    }>;
}
export declare const playbookPerformanceService: PlaybookPerformanceService;
//# sourceMappingURL=playbookPerformance.service.d.ts.map