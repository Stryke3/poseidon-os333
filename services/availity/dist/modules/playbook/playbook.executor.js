"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPlaybook = applyPlaybook;
exports.executePlaybookOnPacketJson = executePlaybookOnPacketJson;
const playbook_amendment_block_js_1 = require("./playbook.amendment-block.js");
/**
 * Apply playbook document rules + required-document checks on an attachment-shaped packet.
 * Mutates a shallow copy of `attachments` only; returns a new `updatedPacket`.
 * Appended payer rule text includes a visible header (playbook id + version + document type).
 */
function applyPlaybook(packet, playbook) {
    const modifications = [];
    const textAmendments = [];
    let attachments = packet.attachments.map((a) => ({ ...a }));
    if (playbook.documentRules?.lmnAdditions?.length) {
        for (const addition of playbook.documentRules.lmnAdditions) {
            const add = String(addition ?? "").trim();
            if (!add)
                continue;
            const block = (0, playbook_amendment_block_js_1.formatPlaybookAmendmentBlock)(playbook, "LMN", add);
            textAmendments.push({
                documentType: "LMN",
                addition: add,
                playbookId: playbook.id,
                playbookVersion: playbook.version,
            });
            attachments = attachments.map((doc) => {
                if (doc.type === "LMN") {
                    modifications.push(`LMN modified with playbook text: ${add}`);
                    return { ...doc, content: `${doc.content}${block}` };
                }
                return doc;
            });
        }
    }
    if (playbook.documentRules?.clinicalAdditions?.length) {
        for (const addition of playbook.documentRules.clinicalAdditions) {
            const add = String(addition ?? "").trim();
            if (!add)
                continue;
            const block = (0, playbook_amendment_block_js_1.formatPlaybookAmendmentBlock)(playbook, "CLINICAL_SUMMARY", add);
            textAmendments.push({
                documentType: "CLINICAL_SUMMARY",
                addition: add,
                playbookId: playbook.id,
                playbookVersion: playbook.version,
            });
            attachments = attachments.map((doc) => {
                if (doc.type === "CLINICAL_SUMMARY") {
                    modifications.push(`CLINICAL_SUMMARY modified with playbook text: ${add}`);
                    return { ...doc, content: `${doc.content}${block}` };
                }
                return doc;
            });
        }
    }
    if (playbook.strategy?.requiredDocuments?.length) {
        for (const doc of playbook.strategy.requiredDocuments) {
            if (!attachments.find((d) => d.type === doc)) {
                modifications.push(`Missing required document: ${doc}`);
            }
        }
    }
    return {
        playbookId: playbook.id,
        version: playbook.version,
        modifications,
        textAmendments,
        updatedPacket: { attachments },
    };
}
function clonePacketView(v) {
    return {
        ...v,
        documentIds: [...v.documentIds],
        documents: v.documents.map((d) => ({ ...d, provenance: { ...d.provenance } })),
        documentsByType: { ...v.documentsByType },
    };
}
function packetViewToApplyPacket(view) {
    return {
        attachments: view.documents.map((d) => ({ type: d.type, content: d.renderedText })),
    };
}
function applyAttachmentsToView(view, attachments) {
    for (let i = 0; i < view.documents.length; i++) {
        const doc = view.documents[i];
        const att = attachments[i];
        if (!att || att.type !== doc.type)
            continue;
        doc.renderedText = att.content;
        const byType = view.documentsByType[doc.type];
        if (byType) {
            view.documentsByType[doc.type] = { ...doc };
        }
    }
}
function timingNotes(timing) {
    if (timing === "DELAY") {
        return "Playbook timing: DELAY — do not submit until internal delay rules are satisfied.";
    }
    if (timing === "REVIEW") {
        return "Playbook timing: REVIEW — hold for manual review before submission.";
    }
    if (timing === "IMMEDIATE") {
        return "Playbook timing: IMMEDIATE — eligible to submit when packet is complete.";
    }
    return "Playbook: no timing directive.";
}
function executePlaybookOnPacketJson(playbook, packetView) {
    const view = clonePacketView(packetView);
    const beforeTexts = view.documents.map((d) => d.renderedText);
    const bridge = packetViewToApplyPacket(view);
    const applied = applyPlaybook(bridge, playbook);
    applyAttachmentsToView(view, applied.updatedPacket.attachments);
    const modifiedDocumentIds = [];
    for (let i = 0; i < view.documents.length; i++) {
        if (view.documents[i].renderedText !== beforeTexts[i]) {
            const id = view.documentIds[i];
            if (id)
                modifiedDocumentIds.push(id);
        }
    }
    const modifications = [...applied.modifications];
    const textAmendments = [...applied.textAmendments];
    const timing = playbook.strategy.timing;
    if (timing) {
        modifications.push(`strategy.timing: ${timing}`);
    }
    for (const line of playbook.escalationRules.onDenial ?? []) {
        const t = line.trim();
        if (!t)
            continue;
        modifications.push(`escalation.onDenial: ${t}`);
    }
    if (playbook.escalationRules.peerToPeer === true) {
        modifications.push("escalation.peerToPeer: true (schedule peer-to-peer if denied).");
    }
    const payloadPatch = {
        playbookExecutionSummary: {
            playbookId: playbook.id,
            version: playbook.version,
            timing: timing ?? null,
            textAmendments,
        },
        playbookSubmissionTiming: {
            timing: timing ?? null,
            notes: timingNotes(timing),
        },
    };
    modifications.push("Playbook run complete.");
    return {
        playbookId: playbook.id,
        version: playbook.version,
        modifications,
        updatedPacket: view,
        modifiedDocumentIds: [...new Set(modifiedDocumentIds)],
        payloadPatch,
        textAmendments,
    };
}
//# sourceMappingURL=playbook.executor.js.map