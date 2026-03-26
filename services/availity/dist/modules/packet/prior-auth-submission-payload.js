"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachmentsFromStoredPayload = attachmentsFromStoredPayload;
exports.mergeAttachmentsIntoStoredPayload = mergeAttachmentsIntoStoredPayload;
exports.syncPriorAuthDocumentsFromAttachments = syncPriorAuthDocumentsFromAttachments;
const playbook_document_versioning_js_1 = require("../playbook/playbook.document-versioning.js");
/** Reads `attachments[]` from a stored prior-auth packet JSON payload for playbook apply. */
function attachmentsFromStoredPayload(payload) {
    if (!payload || typeof payload !== "object")
        return [];
    const raw = payload.attachments;
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw) {
        if (!item || typeof item !== "object")
            continue;
        const o = item;
        out.push({
            type: String(o.type ?? ""),
            content: String(o.content ?? ""),
        });
    }
    return out;
}
function mergeAttachmentsIntoStoredPayload(payload, attachments) {
    return { ...payload, attachments };
}
/**
 * Aligns `PriorAuthDocument.content` after playbook apply using {@link persistPlaybookAmendedDocument}
 * (version bump + prior content preserved under `inputSnapshot._playbookContentHistory`).
 */
async function syncPriorAuthDocumentsFromAttachments(prisma, opts) {
    const { documentIds, attachments } = opts;
    if (documentIds.length === 0)
        return;
    const byType = new Map(attachments.map((a) => [a.type, a.content]));
    const rows = await prisma.priorAuthDocument.findMany({
        where: { id: { in: documentIds } },
        select: { id: true, type: true, content: true },
    });
    for (const row of rows) {
        const next = byType.get(row.type);
        if (next !== undefined && next !== row.content) {
            await (0, playbook_document_versioning_js_1.persistPlaybookAmendedDocument)(prisma, {
                documentId: row.id,
                newContent: next,
                playbookExecutionId: opts.playbookExecutionId,
                playbookId: opts.playbookId,
                playbookVersion: opts.playbookVersion,
                actor: opts.actor,
                payerId: opts.payerId,
                caseId: opts.caseId,
            });
        }
    }
}
//# sourceMappingURL=prior-auth-submission-payload.js.map