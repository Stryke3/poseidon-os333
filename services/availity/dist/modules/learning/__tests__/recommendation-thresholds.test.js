"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const recommendationEnginePlaybook_service_js_1 = require("../recommendationEnginePlaybook.service.js");
const governance_constants_js_1 = require("../../governance/governance.constants.js");
(0, vitest_1.describe)("RecommendationEngineService thresholds", () => {
    (0, vitest_1.it)("does not create recommendation when sample size is too small", async () => {
        const db = {
            playbookPerformance: {
                findFirst: vitest_1.vi.fn().mockResolvedValue({
                    id: "perf_1",
                    playbookId: "pb_1",
                    version: 1,
                    payerId: "AETNA",
                    totalCases: 9,
                    approvals: 9,
                    avgTurnaroundDays: 2,
                }),
            },
            governanceRecommendation: {
                findMany: vitest_1.vi.fn().mockResolvedValue([]),
                create: vitest_1.vi.fn(),
            },
        };
        const svc = new recommendationEnginePlaybook_service_js_1.RecommendationEngineService(db);
        const rec = await svc.evaluatePlaybook("pb_1", 1);
        (0, vitest_1.expect)(rec).toBeNull();
        (0, vitest_1.expect)(db.governanceRecommendation.create).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)("creates recommendation when threshold is met with evidence refs", async () => {
        const db = {
            playbookPerformance: {
                findFirst: vitest_1.vi.fn().mockResolvedValue({
                    id: "perf_2",
                    playbookId: "pb_2",
                    version: 2,
                    payerId: "AETNA",
                    totalCases: 10,
                    approvals: 9,
                    avgTurnaroundDays: 3,
                    denialReasons: {},
                }),
            },
            governanceRecommendation: {
                findMany: vitest_1.vi.fn().mockResolvedValue([]),
                create: vitest_1.vi.fn().mockImplementation(async ({ data }) => ({ id: "rec_1", ...data })),
            },
        };
        const svc = new recommendationEnginePlaybook_service_js_1.RecommendationEngineService(db);
        const rec = await svc.evaluatePlaybook("pb_2", 2);
        (0, vitest_1.expect)(rec?.recommendationType).toBe(governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.PROMOTE_PLAYBOOK);
        (0, vitest_1.expect)(rec?.evidence?.references?.playbookPerformanceId).toBe("perf_2");
    });
});
//# sourceMappingURL=recommendation-thresholds.test.js.map