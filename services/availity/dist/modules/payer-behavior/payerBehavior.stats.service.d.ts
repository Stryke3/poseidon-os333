import type { PrismaClient } from "@prisma/client";
import type { PayerBehaviorStats } from "./payerBehavior.types.js";
export type PayerBehaviorStatsQuery = {
    payerId: string;
    planName?: string;
    deviceCategory?: string;
    hcpcsCode?: string;
    diagnosisCode?: string;
};
/** Pure aggregation (used by {@link PayerBehaviorStatsService.getStats} and tests). */
export declare function aggregateAuthorizationOutcomes(outcomes: Array<{
    outcome: string;
    denialReason: string | null;
}>): PayerBehaviorStats;
export declare class PayerBehaviorStatsService {
    private readonly db;
    constructor(db: PrismaClient);
    getStats(input: PayerBehaviorStatsQuery): Promise<PayerBehaviorStats>;
}
export declare function createPayerBehaviorStatsService(p: PrismaClient): PayerBehaviorStatsService;
/** Shared app client — single Prisma instance. */
export declare const payerBehaviorStatsService: PayerBehaviorStatsService;
//# sourceMappingURL=payerBehavior.stats.service.d.ts.map