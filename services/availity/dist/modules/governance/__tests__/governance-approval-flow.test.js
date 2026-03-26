"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const governance_decision_service_js_1 = require("../governance.decision.service.js");
const governance_constants_js_1 = require("../governance.constants.js");
(0, vitest_1.describe)("approveGovernanceRecommendation", () => {
    (0, vitest_1.it)("records decision and updates recommendation status", async () => {
        const prisma = {
            governanceRecommendation: {
                findUnique: vitest_1.vi.fn().mockResolvedValue({
                    id: "rec_1",
                    status: governance_constants_js_1.GOVERNANCE_STATUS.PENDING,
                    recommendationType: "REVISE_PLAYBOOK",
                    draftPayload: { playbookId: "pb_1" },
                }),
                update: vitest_1.vi.fn().mockResolvedValue({ id: "rec_1", status: governance_constants_js_1.GOVERNANCE_STATUS.APPROVED }),
            },
            governanceDecision: {
                create: vitest_1.vi.fn().mockResolvedValue({ id: "decision_1" }),
            },
            $transaction: vitest_1.vi.fn().mockResolvedValue([]),
        };
        const out = await (0, governance_decision_service_js_1.approveGovernanceRecommendation)(prisma, "rec_1", "admin@test", "looks good");
        (0, vitest_1.expect)(out.success).toBe(true);
        (0, vitest_1.expect)(prisma.governanceDecision.create).toHaveBeenCalled();
        (0, vitest_1.expect)(prisma.governanceRecommendation.update).toHaveBeenCalledWith({
            where: { id: "rec_1" },
            data: { status: governance_constants_js_1.GOVERNANCE_STATUS.APPROVED },
        });
    });
});
//# sourceMappingURL=governance-approval-flow.test.js.map