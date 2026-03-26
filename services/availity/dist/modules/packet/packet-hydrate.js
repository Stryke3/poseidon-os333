"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDocumentRefs = parseDocumentRefs;
exports.hydratePriorAuthPacketView = hydratePriorAuthPacketView;
const packet_js_1 = require("../../types/packet.js");
const TRACE_FALLBACK = "All rendered statements trace to case demographics, user-entered clinical fields, or non-clinical payer checklist hints. Templates do not synthesize clinical facts.";
function parseDocumentRefs(documentsJson) {
    if (!documentsJson || typeof documentsJson !== "object")
        return [];
    const ids = documentsJson.documentIds;
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
}
function rowToOutput(row) {
    const snap = row.inputSnapshot;
    const meta = snap?._packetGen;
    return {
        type: row.type,
        templateId: meta?.templateId ?? `${row.type}.stored`,
        docVersion: row.version,
        renderedText: row.content,
        provenance: meta?.provenance ?? {},
    };
}
function hydratePriorAuthPacketView(params) {
    const payload = params.payloadJson;
    const byId = new Map(params.rows.map((r) => [r.id, r]));
    const ids = parseDocumentRefs(params.documentsJson);
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    const docOutputs = ordered.map(rowToOutput);
    const documentsByType = {};
    for (const d of docOutputs) {
        documentsByType[d.type] = d;
    }
    return {
        schemaVersion: packet_js_1.PACKET_SCHEMA_VERSION,
        packetId: params.id,
        caseId: params.caseId,
        status: params.status,
        deviceType: payload?.deviceType ?? null,
        generatedAt: params.updatedAt.toISOString(),
        documentIds: ids,
        snapshotHash: payload?.snapshotHash ?? null,
        generationVersion: payload?.generationVersion ?? 0,
        documents: docOutputs,
        documentsByType,
        traceabilityNote: payload?.traceabilityNote ?? TRACE_FALLBACK,
    };
}
//# sourceMappingURL=packet-hydrate.js.map