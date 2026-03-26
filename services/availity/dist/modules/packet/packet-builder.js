"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPayloadStored = buildPayloadStored;
exports.buildPriorAuthPacketJson = buildPriorAuthPacketJson;
const packet_js_1 = require("../../types/packet.js");
const TRACE_NOTE = "All rendered statements trace to case demographics, user-entered clinical fields, or non-clinical payer checklist hints. Templates do not synthesize clinical facts.";
function buildPayloadStored(params) {
    return {
        schemaVersion: packet_js_1.PACKET_SCHEMA_VERSION,
        generationVersion: params.generationVersion,
        snapshotHash: params.snapshotHash,
        deviceType: params.deviceType,
        traceabilityNote: TRACE_NOTE,
    };
}
function buildPriorAuthPacketJson(params) {
    const documentsByType = {};
    for (const d of params.documents) {
        documentsByType[d.type] = d;
    }
    return {
        schemaVersion: packet_js_1.PACKET_SCHEMA_VERSION,
        packetId: params.packetId,
        caseId: params.caseId,
        status: params.status,
        deviceType: params.deviceType,
        generatedAt: new Date().toISOString(),
        documentIds: params.documentIds,
        snapshotHash: params.snapshotHash,
        generationVersion: params.generationVersion,
        documents: params.documents,
        documentsByType,
        traceabilityNote: TRACE_NOTE,
    };
}
//# sourceMappingURL=packet-builder.js.map