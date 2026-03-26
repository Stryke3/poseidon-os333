"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payerBehaviorStatsService = exports.PayerBehaviorStatsService = void 0;
exports.aggregateAuthorizationOutcomes = aggregateAuthorizationOutcomes;
exports.createPayerBehaviorStatsService = createPayerBehaviorStatsService;
const prisma_js_1 = require("../../lib/prisma.js");
/** Pure aggregation (used by {@link PayerBehaviorStatsService.getStats} and tests). */
function aggregateAuthorizationOutcomes(outcomes) {
    const total = outcomes.length;
    const approved = outcomes.filter((o) => o.outcome === "APPROVED").length;
    const denied = outcomes.filter((o) => o.outcome === "DENIED").length;
    const approvalRate = total > 0 ? approved / total : 0;
    const reasonCounts = new Map();
    for (const outcome of outcomes) {
        if (outcome.denialReason) {
            reasonCounts.set(outcome.denialReason, (reasonCounts.get(outcome.denialReason) ?? 0) + 1);
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
class PayerBehaviorStatsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async getStats(input) {
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
exports.PayerBehaviorStatsService = PayerBehaviorStatsService;
function createPayerBehaviorStatsService(p) {
    return new PayerBehaviorStatsService(p);
}
/** Shared app client — single Prisma instance. */
exports.payerBehaviorStatsService = new PayerBehaviorStatsService(prisma_js_1.prisma);
//# sourceMappingURL=payerBehavior.stats.service.js.map