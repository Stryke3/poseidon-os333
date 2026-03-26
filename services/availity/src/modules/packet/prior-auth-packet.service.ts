import { createHash } from "node:crypto";
import type { PriorAuthPacket } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { buildPayloadStored } from "./packet-builder.js";
import type { DocumentGeneratorInput } from "../../schemas/packet.js";
import { documentGeneratorService } from "./document-generator.service.js";

function hashPacketInput(caseId: string, input: DocumentGeneratorInput): string {
  return createHash("sha256")
    .update(JSON.stringify({ caseId, input }))
    .digest("hex");
}

/**
 * Builds an LMN + SWO pair via {@link documentGeneratorService}, then persists a
 * {@link PriorAuthPacket} with `documents: { documentIds }` (hydration-compatible)
 * and a submission-oriented `payload` (patient / device / physician / attachments + trace fields).
 */
export class PriorAuthPacketService {
  async buildPacket(
    caseId: string,
    input: DocumentGeneratorInput,
  ): Promise<PriorAuthPacket> {
    const existingCase = await prisma.case.findUnique({ where: { id: caseId } });
    if (!existingCase) {
      throw new Error("CASE_NOT_FOUND");
    }

    const lmn = await documentGeneratorService.generateLMN(caseId, input);
    const swo = await documentGeneratorService.generateSWO(caseId, input);

    const packetCount = await prisma.priorAuthPacket.count({ where: { caseId } });
    const generationVersion = packetCount + 1;
    const snapshotHash = hashPacketInput(caseId, input);

    const submissionPayload = {
      patient: input.patient,
      device: input.device,
      physician: input.physician,
      attachments: [
        { type: "LMN" as const, content: lmn.content },
        { type: "SWO" as const, content: swo.content },
      ],
      ...buildPayloadStored({
        generationVersion,
        snapshotHash,
        deviceType: "DME_GENERIC",
      }),
    };

    return prisma.priorAuthPacket.create({
      data: {
        caseId,
        documents: {
          documentIds: [lmn.id, swo.id],
        },
        payload: submissionPayload as object,
        status: "READY",
      },
    });
  }
}

export const priorAuthPacketService = new PriorAuthPacketService();
