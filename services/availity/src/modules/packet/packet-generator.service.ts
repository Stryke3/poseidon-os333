import type { Prisma, PrismaClient } from "@prisma/client";
import type { PacketClinicalInput, PriorAuthPacketJson } from "../../types/packet.js";
import {
  buildPayloadStored,
  buildPriorAuthPacketJson,
} from "./packet-builder.js";
import {
  buildPacketGenerationSnapshot,
  hashSnapshot,
  snapshotToRenderContext,
} from "./packet-snapshot.js";
import {
  provenanceForTemplate,
  renderTemplate,
  variablesForTemplate,
} from "./template-engine.js";
import { getTemplateSetForDeviceType } from "./template-registry.js";
import { logger } from "../../lib/logger.js";
import {
  CLINICAL_GENERATION_POLICY_VERSION,
  CLINICAL_GENERATION_RULES,
} from "./compliance.js";
import { applyPlaybookAfterPacketGeneration } from "../playbook/playbook.service.js";

function readPayloadGenerationVersion(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0;
  const v = (payload as Record<string, unknown>).generationVersion;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function readDeviceTypeFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "DME_GENERIC";
  const d = (payload as Record<string, unknown>).deviceType;
  return typeof d === "string" && d.length > 0 ? d : "DME_GENERIC";
}

export async function generatePacketCore(
  tx: Prisma.TransactionClient,
  packetId: string,
  clinical: PacketClinicalInput,
  actor: string,
): Promise<PriorAuthPacketJson> {
  const packet = await tx.priorAuthPacket.findUnique({
    where: { id: packetId },
    include: { case: true },
  });

  if (!packet || !packet.case) {
    throw new Error("PACKET_NOT_FOUND");
  }

  const snapshotModel = buildPacketGenerationSnapshot(packet.case, clinical);
  const snapshotHash = hashSnapshot(snapshotModel);
  const generationVersion = readPayloadGenerationVersion(packet.payload) + 1;
  const deviceType = readDeviceTypeFromPayload(packet.payload);

  const templateSet = getTemplateSetForDeviceType(deviceType);
  const docOutputs: PriorAuthPacketJson["documents"] = [];
  const documentIds: string[] = [];

  for (const t of templateSet.templates) {
    const lastForType = await tx.priorAuthDocument.findFirst({
      where: { caseId: packet.caseId, type: t.docType },
      orderBy: { version: "desc" },
    });
    const docVersion = (lastForType?.version ?? 0) + 1;
    const ctx = snapshotToRenderContext(snapshotModel);
    const vars = variablesForTemplate(t.body, ctx);
    const renderedText = renderTemplate(t.body, vars);
    const provenance = provenanceForTemplate(t.body);

    const row = await tx.priorAuthDocument.create({
      data: {
        caseId: packet.caseId,
        type: t.docType,
        content: renderedText,
        inputSnapshot: {
          ...snapshotModel,
          _packetGen: { templateId: t.id, provenance },
          _compliance: {
            policyVersion: CLINICAL_GENERATION_POLICY_VERSION,
            rules: [...CLINICAL_GENERATION_RULES],
            placeholderProvenance: provenance,
          },
        } as object,
        version: docVersion,
      },
    });

    documentIds.push(row.id);

    docOutputs.push({
      type: t.docType,
      templateId: t.id,
      docVersion,
      renderedText,
      provenance,
    });
  }

  const payloadStored = buildPayloadStored({
    generationVersion,
    snapshotHash,
    deviceType,
  });

  const packetView = buildPriorAuthPacketJson({
    packetId,
    caseId: packet.caseId,
    status: "READY",
    deviceType,
    snapshotHash,
    generationVersion,
    documentIds,
    documents: docOutputs,
  });

  await tx.priorAuthPacket.update({
    where: { id: packetId },
    data: {
      status: "READY",
      documents: { documentIds } as object,
      payload: payloadStored as object,
    },
  });

  const packetViewAfterPlaybook = await applyPlaybookAfterPacketGeneration(tx, {
    packetId,
    caseId: packet.caseId,
    clinical,
    packetView,
    actor,
  });

  logger.info(
    {
      packetGenerated: true,
      packetId,
      caseId: packet.caseId,
      actor,
      generationVersion,
      templateSet: templateSet.deviceTypeKey,
      documentCount: documentIds.length,
      playbookApplied: packetViewAfterPlaybook !== packetView,
    },
    "packet_generated",
  );

  return packetViewAfterPlaybook;
}

export async function createPacketWithInitialGeneration(
  prisma: PrismaClient,
  params: {
    caseId: string;
    deviceType?: string;
    clinical: PacketClinicalInput;
    actor: string;
  },
): Promise<{ packetId: string; packetJson: PriorAuthPacketJson }> {
  return prisma.$transaction(async (tx) => {
    const caseRow = await tx.case.findUnique({ where: { id: params.caseId } });
    if (!caseRow) {
      throw new Error("CASE_NOT_FOUND");
    }

    const deviceType = params.deviceType ?? "DME_GENERIC";

    const packet = await tx.priorAuthPacket.create({
      data: {
        caseId: params.caseId,
        status: "DRAFT",
        documents: { documentIds: [] } as object,
        payload: buildPayloadStored({
          generationVersion: 0,
          snapshotHash: "",
          deviceType,
        }) as object,
      },
    });

    logger.info(
      {
        packetCreated: true,
        packetId: packet.id,
        caseId: params.caseId,
        actor: params.actor,
        deviceType,
      },
      "packet_created",
    );

    const packetJson = await generatePacketCore(
      tx,
      packet.id,
      params.clinical,
      params.actor,
    );

    return { packetId: packet.id, packetJson };
  });
}

export async function regeneratePacket(
  prisma: PrismaClient,
  params: {
    packetId: string;
    clinical: PacketClinicalInput;
    actor: string;
  },
): Promise<PriorAuthPacketJson> {
  return prisma.$transaction(async (tx) => {
    return generatePacketCore(tx, params.packetId, params.clinical, params.actor);
  });
}
