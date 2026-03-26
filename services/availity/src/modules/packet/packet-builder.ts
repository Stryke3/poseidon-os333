import type {
  PacketDocumentOutput,
  PacketDocumentType,
  PacketPayloadStoredJson,
  PriorAuthPacketJson,
} from "../../types/packet.js";
import { PACKET_SCHEMA_VERSION } from "../../types/packet.js";

const TRACE_NOTE =
  "All rendered statements trace to case demographics, user-entered clinical fields, or non-clinical payer checklist hints. Templates do not synthesize clinical facts.";

export function buildPayloadStored(params: {
  generationVersion: number;
  snapshotHash: string;
  deviceType: string;
}): PacketPayloadStoredJson {
  return {
    schemaVersion: PACKET_SCHEMA_VERSION,
    generationVersion: params.generationVersion,
    snapshotHash: params.snapshotHash,
    deviceType: params.deviceType,
    traceabilityNote: TRACE_NOTE,
  };
}

export function buildPriorAuthPacketJson(params: {
  packetId: string;
  caseId: string;
  status: string;
  deviceType: string | null;
  snapshotHash: string | null;
  generationVersion: number;
  documentIds: string[];
  documents: PacketDocumentOutput[];
}): PriorAuthPacketJson {
  const documentsByType: Partial<Record<PacketDocumentType, PacketDocumentOutput>> =
    {};
  for (const d of params.documents) {
    documentsByType[d.type] = d;
  }

  return {
    schemaVersion: PACKET_SCHEMA_VERSION,
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
