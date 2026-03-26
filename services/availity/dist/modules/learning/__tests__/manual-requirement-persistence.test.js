"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const manualRequirementExtraction_service_js_1 = require("../manualRequirementExtraction.service.js");
const governance_constants_js_1 = require("../../governance/governance.constants.js");
(0, vitest_1.describe)("persistManualRequirementExtractions", () => {
    (0, vitest_1.it)("deletes only non-approved rows and persists extracted candidates", async () => {
        const deleteMany = vitest_1.vi.fn().mockResolvedValue({ count: 2 });
        const createMany = vitest_1.vi.fn().mockResolvedValue({ count: 1 });
        const tx = { manualRequirement: { deleteMany, createMany } };
        const prisma = {
            $transaction: vitest_1.vi.fn(async (fn) => fn(tx)),
        };
        const out = await (0, manualRequirementExtraction_service_js_1.persistManualRequirementExtractions)(prisma, "manual_1", "AETNA", null, "Prior authorization required. Submit LMN.", { useLlm: false, reviewOnly: true });
        (0, vitest_1.expect)(deleteMany).toHaveBeenCalledWith({
            where: {
                manualId: "manual_1",
                reviewState: { notIn: [governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.APPROVED, governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.REJECTED] },
            },
        });
        (0, vitest_1.expect)(createMany).toHaveBeenCalled();
        const createData = createMany.mock.calls[0]?.[0]?.data ?? [];
        (0, vitest_1.expect)(createData.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(createData.every((r) => typeof r.sourceExcerpt === "string" && r.sourceExcerpt.length > 0)).toBe(true);
        (0, vitest_1.expect)(createData.every((r) => r.reviewState === governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.PENDING_REVIEW)).toBe(true);
        (0, vitest_1.expect)(createData.every((r) => r.active === false)).toBe(true);
        (0, vitest_1.expect)(out.created).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=manual-requirement-persistence.test.js.map