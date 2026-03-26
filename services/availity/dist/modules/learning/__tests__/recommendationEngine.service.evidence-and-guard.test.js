"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const recommendationEngine_service_js_1 = require("../recommendationEngine.service.js");
const governance_constants_js_1 = require("../../governance/governance.constants.js");
(0, vitest_1.describe)("RecommendationEngineService invariants", () => {
    (0, vitest_1.it)("evaluatePlaybook includes evidence references + explainable policy", async () => {
        const db = {
            playbookPerformance: {
                findFirst: vitest_1.vi.fn().mockResolvedValue({
                    id: "perf_1",
                    playbookId: "pb_1",
                    version: 1,
                    payerId: "AETNA",
                    totalCases: 10,
                    approvals: 9,
                    avgTurnaroundDays: 3,
                    denialReasons: { x: 2 },
                    calculatedAt: new Date(),
                }),
            },
            governanceRecommendation: {
                findMany: vitest_1.vi.fn().mockResolvedValue([]),
                create: vitest_1.vi.fn().mockImplementation(async ({ data }) => ({
                    id: "rec_1",
                    ...data,
                })),
            },
            manualRequirement: {},
            learnedRuleSuggestion: {},
        };
        const svc = new recommendationEngine_service_js_1.RecommendationEngineService(db);
        const out = await svc.evaluatePlaybook("pb_1", 1);
        (0, vitest_1.expect)(out?.recommendationType).toBe(governance_constants_js_1.GOVERNANCE_RECOMMENDATION_TYPE.PROMOTE_PLAYBOOK);
        (0, vitest_1.expect)(out?.status).toBe(governance_constants_js_1.GOVERNANCE_STATUS.PENDING);
        (0, vitest_1.expect)(out.evidence?.references?.playbookPerformanceId).toBe("perf_1");
        (0, vitest_1.expect)(out.evidence?.policy?.explainable).toBe(true);
        (0, vitest_1.expect)(out.evidence?.policy?.noAutoApply).toBe(true);
    });
    (0, vitest_1.it)("createRuleSuggestionFromOutcomes does not create suggestions when an approved manual exists", async () => {
        const db = {
            manualRequirement: {
                findFirst: vitest_1.vi.fn().mockResolvedValue({ id: "manual_req_approved" }),
            },
            learnedRuleSuggestion: {
                findFirst: vitest_1.vi.fn(),
                create: vitest_1.vi.fn(),
            },
        };
        const svc = new recommendationEngine_service_js_1.RecommendationEngineService(db);
        const out = await svc.createRuleSuggestionFromOutcomes({
            payerId: "AETNA",
            pattern: { planName: undefined, deviceCategory: undefined, hcpcsCode: undefined, diagnosisCode: undefined },
            repeatedDenialReason: "denial text",
            evidence: {},
        });
        (0, vitest_1.expect)(out).toBeNull();
        (0, vitest_1.expect)(db.learnedRuleSuggestion.create).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=recommendationEngine.service.evidence-and-guard.test.js.map