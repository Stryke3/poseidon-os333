"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writePayerIntelligenceAudit = writePayerIntelligenceAudit;
const logger_js_1 = require("./logger.js");
async function writePayerIntelligenceAudit(prisma, entry) {
    await prisma.payerIntelligenceAuditLog.create({
        data: {
            action: entry.action,
            payerId: entry.payerId ?? null,
            caseId: entry.caseId ?? null,
            snapshotId: entry.snapshotId ?? null,
            outcomeId: entry.outcomeId ?? null,
            detailJson: entry.detail === undefined ? undefined : entry.detail,
            actor: entry.actor ?? "system",
        },
    });
    logger_js_1.logger.info({
        payerIntelligenceAudit: true,
        action: entry.action,
        payerId: entry.payerId,
        caseId: entry.caseId,
        snapshotId: entry.snapshotId,
        actor: entry.actor ?? "system",
    }, "payer_intelligence_audit");
}
//# sourceMappingURL=payer-intelligence-audit.js.map