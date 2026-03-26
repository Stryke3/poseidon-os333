"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.playbookPerformanceService = exports.PlaybookPerformanceService = void 0;
exports.rollupAuthorizationOutcomes = rollupAuthorizationOutcomes;
exports.persistPlaybookPerformanceSnapshot = persistPlaybookPerformanceSnapshot;
const prisma_js_1 = require("../../lib/prisma.js");
function averageTurnaroundDays(nums) {
    if (nums.length === 0)
        return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function rollupAuthorizationOutcomes(rows) {
    const approvals = rows.filter((r) => r.outcome === "APPROVED").length;
    const denials = rows.filter((r) => r.outcome === "DENIED").length;
    const pended = rows.filter((r) => r.outcome === "PENDED").length;
    const turnarounds = rows
        .map((r) => r.turnaroundDays)
        .filter((t) => t != null && Number.isFinite(t));
    const caseIds = new Map();
    const reworkCases = new Set();
    for (const r of rows) {
        if (!r.caseId)
            continue;
        const n = (caseIds.get(r.caseId) ?? 0) + 1;
        caseIds.set(r.caseId, n);
        if (n > 1)
            reworkCases.add(r.caseId);
    }
    const denialReasons = {};
    for (const r of rows) {
        if (r.outcome !== "DENIED" || !r.denialReason?.trim())
            continue;
        const d = r.denialReason.trim().slice(0, 500);
        denialReasons[d] = (denialReasons[d] ?? 0) + 1;
    }
    return {
        approvals,
        denials,
        pended,
        denialReasons,
        avgTurnaroundDays: averageTurnaroundDays(turnarounds),
        reworkCount: reworkCases.size,
    };
}
async function persistPlaybookPerformanceSnapshot(prisma, group, rows) {
    const rollup = rollupAuthorizationOutcomes(rows);
    await prisma.playbookPerformance.create({
        data: {
            playbookId: group.playbookId,
            version: group.playbookVersion,
            payerId: group.payerId,
            planName: group.planName,
            deviceCategory: group.deviceCategory,
            hcpcsCode: group.hcpcsCode,
            diagnosisCode: group.diagnosisCode,
            totalCases: rows.length,
            approvals: rollup.approvals,
            denials: rollup.denials,
            pended: rollup.pended,
            denialReasons: (Object.keys(rollup.denialReasons).length ? rollup.denialReasons : {}),
            avgTurnaroundDays: rollup.avgTurnaroundDays,
            reworkCount: rollup.reworkCount,
        },
    });
    return rollup;
}
class PlaybookPerformanceService {
    db;
    constructor(db = prisma_js_1.prisma) {
        this.db = db;
    }
    async recompute(playbookId, version) {
        const executions = await this.db.playbookExecution.findMany({
            where: { playbookId, version },
            select: { caseId: true },
        });
        const caseIds = Array.from(new Set(executions
            .map((e) => e.caseId)
            .filter((id) => Boolean(id))));
        const outcomes = await this.db.authorizationOutcome.findMany({
            where: { caseId: { in: caseIds } },
        });
        const totalCases = outcomes.length;
        const approvals = outcomes.filter((o) => o.outcome === "APPROVED").length;
        const denials = outcomes.filter((o) => o.outcome === "DENIED").length;
        const pended = outcomes.filter((o) => o.outcome === "PENDED").length;
        const avgTurnaroundDays = outcomes.length > 0
            ? outcomes
                .map((o) => o.turnaroundDays ?? 0)
                .reduce((a, b) => a + b, 0) / outcomes.length
            : null;
        const reasonCounts = new Map();
        for (const outcome of outcomes) {
            if (outcome.denialReason) {
                reasonCounts.set(outcome.denialReason, (reasonCounts.get(outcome.denialReason) ?? 0) + 1);
            }
        }
        const denialReasons = [...reasonCounts.entries()].map(([reason, count]) => ({
            reason,
            count,
        }));
        const first = outcomes[0];
        return this.db.playbookPerformance.create({
            data: {
                playbookId,
                version,
                payerId: first?.payerId ?? "UNKNOWN",
                planName: first?.planName ?? null,
                deviceCategory: first?.deviceCategory ?? null,
                hcpcsCode: first?.hcpcsCode ?? null,
                diagnosisCode: first?.diagnosisCode ?? null,
                totalCases,
                approvals,
                denials,
                pended,
                avgTurnaroundDays,
                reworkCount: 0,
                denialReasons: denialReasons,
            },
        });
    }
}
exports.PlaybookPerformanceService = PlaybookPerformanceService;
exports.playbookPerformanceService = new PlaybookPerformanceService();
//# sourceMappingURL=playbookPerformance.service.js.map