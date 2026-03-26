import app from "./app.js";
import { prisma } from "./lib/prisma.js";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";
import { setAuditPrisma } from "./lib/audit.js";

setAuditPrisma(prisma);

async function main() {
  await prisma.$connect();
  logger.info("Connected to database");

  app.listen(config.port, () => {
    logger.info({ port: config.port }, "Availity integration service started");
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start");
  process.exit(1);
});

export { app };
