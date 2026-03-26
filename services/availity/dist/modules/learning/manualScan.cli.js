"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_js_1 = require("../../lib/prisma.js");
const manualScanIngestion_service_js_1 = require("./manualScanIngestion.service.js");
async function main() {
    const root = process.env.TRIDENT_MANUALS_PATH?.trim();
    const result = await (0, manualScanIngestion_service_js_1.scanAndIngestTridentManuals)(prisma_js_1.prisma, {
        root: root || undefined,
        actor: "cli-manual-scan",
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.failed.length > 0) {
        process.exitCode = 1;
    }
}
main().finally(() => prisma_js_1.prisma.$disconnect());
//# sourceMappingURL=manualScan.cli.js.map