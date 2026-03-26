import type { PriorAuthDocument } from "@prisma/client";
import type {
  PacketDocumentOutput,
  PacketDocumentType,
  PacketDocumentsRefJson,
  PacketPayloadStoredJson,
  PriorAuthPacketJson,
} from "../../types/packet.js";
import { PACKET_SCHEMA_VERSION } from "../../types/packet.js";

const TRACE_FALLBACK =
  "All rendered statements trace to case demographics, user-entered clinical fields, or non-clinical payer checklist hints. Templates do not synthesize clinical facts.";

export function parseDocumentRefs(documentsJson: unknown): string[] {
  if (!documentsJson || typeof documentsJson !== "object") return [];
  const ids = (documentsJson as PacketDocumentsRefJson).documentIds;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
}

function rowToOutput(row: PriorAuthDocument): PacketDocumentOutput {
  const snap = row.inputSnapshot as Record<string, unknown> | null;
  const meta = snap?._packetGen as
    | { templateId?: string; provenance?: Record<string, string> }
    | undefined;
  return {
    type: row.type as PacketDocumentType,
    templateId: meta?.templateId ?? `${row.type}.stored`,
    docVersion: row.version,
    renderedText: row.content,
    provenance: meta?.provenance ?? {},
  };
}

export function hydratePriorAuthPacketView(params: {
  id: string;
  caseId: string;
  status: string;
  documentsJson: unknown;
  payloadJson: unknown;
  rows: PriorAuthDocument[];
  updatedAt: Date;
}): PriorAuthPacketJson {
  const payload = params.payloadJson as Partial<PacketPayloadStoredJson> | null;
  const byId = new Map(params.rows.map((r) => [r.id, r]));
  const ids = parseDocumentRefs(params.documentsJson);
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as PriorAuthDocument[];
  const docOutputs = ordered.map(rowToOutput);

  const documentsByType: PriorAuthPacketJson["documentsByType"] = {};
  for (const d of docOutputs) {
    documentsByType[d.type] = d;
  }

  return {
    schemaVersion: PACKET_SCHEMA_VERSION,
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
