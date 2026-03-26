"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const manualScanIngestion_service_js_1 = require("../manualScanIngestion.service.js");
(0, vitest_1.describe)("scanAndIngestTridentManuals duplicate prevention", () => {
    (0, vitest_1.it)("is idempotent by (sourcePath + contentFingerprint)", async () => {
        const tmpRoot = await promises_1.default.mkdtemp(node_path_1.default.join(node_os_1.default.tmpdir(), "poseidon-trident-"));
        const manualDir = node_path_1.default.join(tmpRoot, "aetna");
        await promises_1.default.mkdir(manualDir, { recursive: true });
        const filePath = node_path_1.default.join(manualDir, "policy.txt");
        await promises_1.default.writeFile(filePath, "LMN is required for prior authorization.\n", "utf8");
        const memory = {};
        const prisma = {
            payerManual: {
                findFirst: vitest_1.vi.fn(async ({ where }) => {
                    const sourcePath = where?.sourcePath;
                    return sourcePath ? memory[sourcePath] ?? null : null;
                }),
                create: vitest_1.vi.fn(async ({ data }) => {
                    const record = { id: "manual_created", ...data };
                    if (data.sourcePath)
                        memory[data.sourcePath] = { id: record.id, contentFingerprint: data.contentFingerprint };
                    return record;
                }),
                update: vitest_1.vi.fn(async ({ where, data }) => {
                    const record = { id: where.id, ...data };
                    if (data.sourcePath)
                        memory[data.sourcePath] = { id: record.id, contentFingerprint: data.contentFingerprint };
                    return record;
                }),
            },
            payerIntelligenceAuditLog: {
                create: vitest_1.vi.fn(async () => ({ id: "audit_1" })),
            },
        };
        const first = await (0, manualScanIngestion_service_js_1.scanAndIngestTridentManuals)(prisma, { root: tmpRoot, actor: "test" });
        (0, vitest_1.expect)(first.inserted).toBe(1);
        (0, vitest_1.expect)(prisma.payerManual.create).toHaveBeenCalledTimes(1);
        const second = await (0, manualScanIngestion_service_js_1.scanAndIngestTridentManuals)(prisma, { root: tmpRoot, actor: "test" });
        (0, vitest_1.expect)(second.inserted).toBe(0);
        (0, vitest_1.expect)(second.updated).toBe(0);
        (0, vitest_1.expect)(prisma.payerManual.create).toHaveBeenCalledTimes(1);
    });
});
//# sourceMappingURL=manual-scan-ingestion.duplicate.test.js.map