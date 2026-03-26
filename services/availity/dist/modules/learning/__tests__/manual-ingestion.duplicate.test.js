"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const manualIngestion_service_js_1 = require("../manualIngestion.service.js");
(0, vitest_1.describe)("ingestPayerManual duplicate prevention", () => {
    (0, vitest_1.it)("returns existing manual when duplicate scope is found", async () => {
        const prisma = {
            payerManual: {
                findFirst: vitest_1.vi.fn().mockResolvedValue({ id: "manual_existing" }),
                create: vitest_1.vi.fn(),
            },
            manualRequirement: {
                count: vitest_1.vi.fn().mockResolvedValue(4),
            },
        };
        const out = await (0, manualIngestion_service_js_1.ingestPayerManual)(prisma, {
            payerId: "AETNA",
            planName: "COMM",
            rawText: "LMN is required for this request.",
            title: "Policy A",
        }, "test-user");
        (0, vitest_1.expect)(out.manualId).toBe("manual_existing");
        (0, vitest_1.expect)(out.requirementsCount).toBe(4);
        (0, vitest_1.expect)(prisma.payerManual.create).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=manual-ingestion.duplicate.test.js.map