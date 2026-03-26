import type { PacketDocumentOutput, PacketPayloadStoredJson, PriorAuthPacketJson } from "../../types/packet.js";
export declare function buildPayloadStored(params: {
    generationVersion: number;
    snapshotHash: string;
    deviceType: string;
}): PacketPayloadStoredJson;
export declare function buildPriorAuthPacketJson(params: {
    packetId: string;
    caseId: string;
    status: string;
    deviceType: string | null;
    snapshotHash: string | null;
    generationVersion: number;
    documentIds: string[];
    documents: PacketDocumentOutput[];
}): PriorAuthPacketJson;
//# sourceMappingURL=packet-builder.d.ts.map