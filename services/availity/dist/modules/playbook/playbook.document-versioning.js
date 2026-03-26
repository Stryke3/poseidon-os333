"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistPlaybookAmendedDocument = persistPlaybookAmendedDocument;
const payer_intelligence_audit_js_1 = require("../../lib/payer-intelligence-audit.js");
/**
 * Applies playbook-amended document text without silent overwrite: bumps `version`, stores full
 * prior `content` under `inputSnapshot._playbookContentHistory`, and writes an audit row.
 */
async function persistPlaybookAmendedDocument(prisma, ctx) {
    const row = await prisma.priorAuthDocument.findUnique({ where: { id: ctx.documentId } });
    if (!row || row.content === ctx.newContent)
        return;
    const snap = row.inputSnapshot && typeof row.inputSnapshot === "object" && row.inputSnapshot !== null
        ? { ...row.inputSnapshot }
        : {};
    const history = Array.isArray(snap._playbookContentHistory)
        ? [...snap._playbookContentHistory]
        : [];
    history.push({
        savedAt: new Date().toISOString(),
        priorDocumentVersion: row.version,
        fullPriorContent: row.content,
        playbookExecutionId: ctx.playbookExecutionId,
        playbookId: ctx.playbookId,
        playbookVersion: ctx.playbookVersion,
        actor: ctx.actor,
    });
    await prisma.priorAuthDocument.update({
        where: { id: ctx.documentId },
        data: {
            content: ctx.newContent,
            version: row.version + 1,
            inputSnapshot: {
                ...snap,
                _playbookContentHistory: history,
                _lastPlaybookExecutionId: ctx.playbookExecutionId,
            },
        },
    });
    await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
        action: "prior_auth_document_playbook_amendment",
        payerId: ctx.payerId,
        caseId: ctx.caseId ?? null,
        detail: {
            documentId: ctx.documentId,
            playbookExecutionId: ctx.playbookExecutionId,
            playbookId: ctx.playbookId,
            priorDocumentVersion: row.version,
            nextDocumentVersion: row.version + 1,
        },
        actor: ctx.actor,
    });
}
//# sourceMappingURL=playbook.document-versioning.js.map