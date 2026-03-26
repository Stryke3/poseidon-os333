import "dotenv/config";
import { prisma } from "../../lib/prisma.js";
import { scanAndIngestTridentManuals } from "./manualScanIngestion.service.js";

async function main() {
  const root = process.env.TRIDENT_MANUALS_PATH?.trim();
  const result = await scanAndIngestTridentManuals(prisma, {
    root: root || undefined,
    actor: "cli-manual-scan",
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed.length > 0) {
    process.exitCode = 1;
  }
}

main().finally(() => prisma.$disconnect());
