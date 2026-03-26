import "dotenv/config";
import { prisma } from "../../lib/prisma.js";
import { runLearningEvaluation } from "./recommendationEngine.service.js";

async function main() {
  const periodDays = process.env.LEARNING_EVALUATE_PERIOD_DAYS
    ? Number(process.env.LEARNING_EVALUATE_PERIOD_DAYS)
    : 90;
  const payerId = process.env.LEARNING_EVALUATE_PAYER_ID?.trim() || undefined;

  const result = await runLearningEvaluation(prisma, {
    periodDays,
    payerId,
    actor: "cli-learning-evaluate",
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
}

main().finally(() => prisma.$disconnect());

