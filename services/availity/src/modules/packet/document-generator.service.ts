import type { PriorAuthDocument } from "@prisma/client";
import type { DocumentGeneratorInput } from "../../schemas/packet.js";
import { prisma } from "../../lib/prisma.js";
import {
  CLINICAL_GENERATION_POLICY_VERSION,
  CLINICAL_GENERATION_RULES,
  TEXT_NOT_SUPPLIED_BY_USER,
  lmnVariableSources,
  swoVariableSources,
} from "./compliance.js";
import { renderTemplate } from "./document.renderer.js";
import { LMN_TEMPLATE, SWO_TEMPLATE } from "./document.templates.js";
import { runDocumentPipeline } from "./pipeline/run-document-pipeline.js";

export type { DocumentGeneratorInput } from "../../schemas/packet.js";

/**
 * Document path: **input → ML scoring → template modifier → render → output** (see `pipeline/`).
 * ML/template stages must not inject clinical prose — see `compliance.ts`.
 * Every row: full `inputSnapshot` + monotonic `version` per (caseId, type).
 */
async function nextDocumentVersion(caseId: string, type: string): Promise<number> {
  const last = await prisma.priorAuthDocument.findFirst({
    where: { caseId, type },
    orderBy: { version: "desc" },
  });
  return (last?.version ?? 0) + 1;
}

export class DocumentGeneratorService {
  async generateLMN(
    caseId: string,
    input: DocumentGeneratorInput,
  ): Promise<PriorAuthDocument> {
    const { variables, scores } = await runDocumentPipeline(
      "LMN",
      input,
      () => ({
        patientName: `${input.patient.firstName} ${input.patient.lastName}`,
        dob: input.patient.dob,
        diagnosis: input.diagnosis?.trim()
          ? input.diagnosis.trim()
          : TEXT_NOT_SUPPLIED_BY_USER,
        device: input.device,
        clinicalJustification: input.justification?.trim() ?? "",
        limitations: input.limitations?.trim() ?? "",
        failedTreatments: input.failedTreatments?.trim() ?? "",
        physicianName: input.physician.name,
        npi: input.physician.npi?.trim() ?? "",
      }),
    );

    const content = renderTemplate(LMN_TEMPLATE.trim(), variables);
    const version = await nextDocumentVersion(caseId, "LMN");

    return prisma.priorAuthDocument.create({
      data: {
        caseId,
        type: "LMN",
        content,
        inputSnapshot: {
          ...input,
          _traceability: {
            policyVersion: CLINICAL_GENERATION_POLICY_VERSION,
            rules: [...CLINICAL_GENERATION_RULES],
            variableSources: lmnVariableSources(),
          },
          _pipeline: { docType: "LMN" as const, scores },
        } as object,
        version,
      },
    });
  }

  async generateSWO(
    caseId: string,
    input: DocumentGeneratorInput,
  ): Promise<PriorAuthDocument> {
    const orderDate = input.orderDate?.trim() ?? "";

    const { variables, scores } = await runDocumentPipeline(
      "SWO",
      input,
      () => ({
        patientName: `${input.patient.firstName} ${input.patient.lastName}`,
        dob: input.patient.dob,
        device: input.device,
        hcpcs: input.hcpcs?.trim() ?? "",
        orderDate,
        physicianName: input.physician.name,
        npi: input.physician.npi?.trim() ?? "",
      }),
    );

    const content = renderTemplate(SWO_TEMPLATE.trim(), variables);
    const version = await nextDocumentVersion(caseId, "SWO");

    return prisma.priorAuthDocument.create({
      data: {
        caseId,
        type: "SWO",
        content,
        inputSnapshot: {
          ...input,
          _traceability: {
            policyVersion: CLINICAL_GENERATION_POLICY_VERSION,
            rules: [...CLINICAL_GENERATION_RULES],
            variableSources: swoVariableSources(),
            orderDateSupplied: Boolean(input.orderDate?.trim()),
          },
          _pipeline: { docType: "SWO" as const, scores },
        } as object,
        version,
      },
    });
  }
}

export const documentGeneratorService = new DocumentGeneratorService();
