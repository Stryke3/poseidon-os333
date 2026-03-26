"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_js_1 = require("../../lib/prisma.js");
const recommendationEngine_service_js_1 = require("./recommendationEngine.service.js");
async function main() {
    const periodDays = process.env.LEARNING_EVALUATE_PERIOD_DAYS
        ? Number(process.env.LEARNING_EVALUATE_PERIOD_DAYS)
        : 90;
    const payerId = process.env.LEARNING_EVALUATE_PAYER_ID?.trim() || undefined;
    const result = await (0, recommendationEngine_service_js_1.runLearningEvaluation)(prisma_js_1.prisma, {
        periodDays,
        payerId,
        actor: "cli-learning-evaluate",
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));
}
main().finally(() => prisma_js_1.prisma.$disconnect());
//# sourceMappingURL=learningEvaluate.cli.js.map