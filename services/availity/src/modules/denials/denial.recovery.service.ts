import type { DenialCategory, DenialClassificationResult, DenialIntakeInput, RecoveryType } from "./denial.types.js";
import { prisma } from "../../lib/prisma.js";
import { classifyDenial } from "./denial.classifier.js";
import { generateAppealDraft } from "./appeal.generator.service.js";
import { denialIntakeBodySchema } from "./denial.schemas.js";
import { parseDocumentRefs } from "../packet/packet-hydrate.js";
import { writePayerIntelligenceAudit } from "../../lib/payer-intelligence-audit.js";
import { logger } from "../../lib/logger.js";

async function loadPacketDocsForPacketId(packetId: string | null | undefined) {
  if (!packetId) return [];
  const packet = await prisma.priorAuthPacket.findUnique({ where: { id: packetId } });
  if (!packet) return [];

  const docIds = parseDocumentRefs(packet.documents);
  if (docIds.length === 0) return [];

  const docs = await prisma.priorAuthDocument.findMany({
    where: { id: { in: docIds } },
  });

  return docs.map((d) => ({ type: String(d.type), content: String(d.content) }));
}

function unique(arr: string[]): string[] {
  return [...new Set(arr.filter((x) => typeof x === "string" && x.trim()))];
}

function docListForRecovery(category: DenialCategory): string[] {
  // Deterministic defaults. Attachments can be refined in controller using ManualRequirement scope.
  switch (category) {
    case "MISSING_DOCUMENTATION":
    case "ADMINISTRATIVE_DEFECT":
      return ["LMN", "SWO", "CLINICAL_SUMMARY"];
    case "MEDICAL_NECESSITY":
      return ["LMN", "CLINICAL_SUMMARY"];
    case "NON_COVERED_SERVICE":
      return ["LMN"];
    case "CODING_MISMATCH":
      return ["SWO", "CLINICAL_SUMMARY"];
    case "TIMELY_FILING":
    case "DUPLICATE":
      return ["LMN", "SWO"];
    case "ELIGIBILITY":
      return ["CLINICAL_SUMMARY"];
    default:
      return ["LMN", "SWO", "CLINICAL_SUMMARY"];
  }
}

function recoveryTypeForCategory(category: DenialCategory): RecoveryType {
  switch (category) {
    case "MISSING_DOCUMENTATION":
    case "ADMINISTRATIVE_DEFECT":
    case "CODING_MISMATCH":
      return "RESUBMIT";
    case "MEDICAL_NECESSITY":
    case "NON_COVERED_SERVICE":
    case "TIMELY_FILING":
      return "APPEAL";
    case "DUPLICATE":
      return "REVIEW";
    case "ELIGIBILITY":
      return "REVIEW";
    default:
      return "REVIEW";
  }
}

/**
 * Deterministic recovery strategy generator (category → recovery plan).
 * Does not invent clinical facts. It only requests fixes/attachments based on denial category.
 */
export function buildRecoveryStrategy(
  input: DenialIntakeInput,
  category: DenialCategory,
  confidence: number,
  baseExplanation: string[],
): Omit<DenialClassificationResult, "category" | "confidence"> {
  const recoveryType = recoveryTypeForCategory(category);
  const requiredAttachments = docListForRecovery(category);

  const requiredFixes: string[] = [];
  const escalationSteps: string[] = [];
  const explanation: string[] = [...baseExplanation];

  const denialReason = input.denialReasonText?.trim() ? input.denialReasonText.trim() : "(no denial reason text provided)";

  requiredFixes.push(`Address denial category: ${category}.`);
  requiredFixes.push(`Use the denied packet facts as evidence; do not introduce new clinical claims not present in packet documents.`);

  escalationSteps.push("Review denial reason and ensure the packet evidence matches the denial category.");
  escalationSteps.push(`If appeal/resubmission is elected, include a clear checklist of required attachments: ${requiredAttachments.join(", ")}.`);

  // Category-specific deterministic details.
  if (category === "MISSING_DOCUMENTATION" || category === "ADMINISTRATIVE_DEFECT") {
    requiredFixes.push("Add the missing or incomplete documents per denial reason text.");
    escalationSteps.push("If denial is due to administrative completeness, confirm signatures/required fields in each document.");
  }

  if (category === "MEDICAL_NECESSITY") {
    requiredFixes.push("Strengthen the rebuttal with packet-authored medical necessity statements (LMN + clinical summary excerpts).");
    escalationSteps.push("If the denial persists, consider escalation pathway per payer policy (peer-to-peer if available).");
  }

  if (category === "CODING_MISMATCH") {
    requiredFixes.push("Verify coding consistency between diagnosis and billed HCPCS using packet SWO/LMN text.");
  }

  if (category === "TIMELY_FILING") {
    requiredFixes.push("Prepare a timely-filing justification packet (include proof and correspondence excerpts present in packet documents, if any).");
  }

  if (category === "ELIGIBILITY") {
    requiredFixes.push("Confirm member eligibility/coverage details before resubmission/appeal.");
  }

  if (category === "DUPLICATE") {
    requiredFixes.push("Check for prior submissions and deduplicate identifiers; only resubmit after confirming the packet is materially different.");
    escalationSteps.push("If uncertain, route to human review to confirm duplication rationale.");
  }

  explanation.push(`RecoveryType=${recoveryType} computed deterministically from denial category (${confidence.toFixed(2)} confidence).`);

  return {
    recoveryType,
    requiredFixes: unique(requiredFixes),
    requiredAttachments: unique(requiredAttachments),
    escalationSteps: unique(escalationSteps),
    explanation: unique(explanation),
  };
}

class DenialRecoveryService {
  async intake(
    input: {
      caseId?: string;
      payerId: string;
      planName?: string;
      authId?: string;
      denialCode?: string;
      denialReasonText: string;
      packetId?: string;
      playbookId?: string;
      playbookVersion?: number;
      scoreSnapshotId?: string;
    },
  ) {
    // Ensure deterministic parsing + required field enforcement.
    const parsed = denialIntakeBodySchema.parse(input) as DenialIntakeInput;

    const denialEvent = await prisma.denialEvent.create({
      data: {
        caseId: parsed.caseId ?? null,
        payerId: parsed.payerId,
        planName: parsed.planName ?? null,
        authId: parsed.authId ?? null,
        denialCode: parsed.denialCode ?? null,
        denialReasonText: parsed.denialReasonText,
        denialCategory: null,
        packetId: parsed.packetId ?? null,
        playbookId: parsed.playbookId ?? null,
        playbookVersion: parsed.playbookVersion ?? null,
        scoreSnapshotId: parsed.scoreSnapshotId ?? null,
      },
    });

    await writePayerIntelligenceAudit(prisma, {
      action: "denial_intake",
      payerId: parsed.payerId,
      caseId: parsed.caseId ?? null,
      snapshotId: null,
      outcomeId: null,
      detail: { denialEventId: denialEvent.id, denialCode: parsed.denialCode ?? null },
      actor: "system",
    });

    return denialEvent;
  }

  async classifyAndSnapshot(denialEventId: string) {
    const event = await prisma.denialEvent.findUnique({ where: { id: denialEventId } });
    if (!event) throw new Error("Denial event not found");

    const result = classifyDenial({
      denialCode: event.denialCode ?? undefined,
      denialReasonText: event.denialReasonText,
    });

    await prisma.denialEvent.update({
      where: { id: denialEventId },
      data: { denialCategory: result.category },
    });

    const snapshot = await prisma.denialClassificationSnapshot.create({
      data: {
        denialEventId,
        category: result.category,
        confidence: result.confidence,
        recoveryType: result.recoveryType,
        requiredFixes: result.requiredFixes as any,
        requiredAttachments: result.requiredAttachments as any,
        escalationSteps: result.escalationSteps as any,
        explanation: result.explanation as any,
      },
    });

    await writePayerIntelligenceAudit(prisma, {
      action: "denial_classified",
      payerId: event.payerId,
      caseId: event.caseId,
      snapshotId: snapshot.id,
      outcomeId: null,
      detail: { denialEventId: event.id, category: result.category },
      actor: "system",
    });

    return snapshot;
  }

  async generateRecoveryPacket(input: {
    denialEventId: string;
    patientName?: string;
    device?: string;
    physicianName?: string;
    rebuttalFacts?: string[];
  }) {
    const event = await prisma.denialEvent.findUnique({ where: { id: input.denialEventId } });
    if (!event) throw new Error("Denial event not found");

    let snapshot = await prisma.denialClassificationSnapshot.findFirst({
      where: { denialEventId: input.denialEventId },
      orderBy: { createdAt: "desc" },
    });

    // Ensure there is always a persisted classification snapshot to link from the appeal.
    if (!snapshot) {
      snapshot = await this.classifyAndSnapshot(input.denialEventId);
    }

    const classification: DenialClassificationResult = {
      category: snapshot.category as any,
      confidence: snapshot.confidence ?? 0.6,
      recoveryType: snapshot.recoveryType as any,
      requiredFixes: Array.isArray(snapshot.requiredFixes)
        ? (snapshot.requiredFixes as any)
        : [],
      requiredAttachments: Array.isArray(snapshot.requiredAttachments)
        ? (snapshot.requiredAttachments as any)
        : [],
      escalationSteps: Array.isArray(snapshot.escalationSteps)
        ? (snapshot.escalationSteps as any)
        : [],
      explanation: Array.isArray(snapshot.explanation)
        ? (snapshot.explanation as any)
        : [],
    };

    // Deterministic traceability: use packet docs as evidence inputs only.
    const packetDocs = await loadPacketDocsForPacketId(event.packetId);

    const denialPayload = {
      id: event.id,
      caseId: event.caseId,
      payerId: event.payerId,
      denialCode: event.denialCode,
      denialReasonText: event.denialReasonText,
      denialCategory: event.denialCategory,
      packetId: event.packetId,
      playbookId: event.playbookId,
      playbookVersion: event.playbookVersion,
      scoreSnapshotId: event.scoreSnapshotId,
    };

    const draft = generateAppealDraft({
      denial: denialPayload as any,
      classification,
      packetDocs,
      classificationSnapshotId: snapshot.id,
    });

    const appealPacket = await prisma.appealPacket.create({
      data: {
        denialEventId: event.id,
        caseId: event.caseId,
        recoveryType: classification.recoveryType,
        letterText: draft.letterText,
        rebuttalPoints: draft.rebuttalPoints as any,
        attachmentChecklist: draft.attachmentChecklist as any,
        payload: draft.payload as any,
        status: "DRAFT",
      },
    });

    await writePayerIntelligenceAudit(prisma, {
      action: "denial_appeal_generated",
      payerId: event.payerId,
      caseId: event.caseId,
      snapshotId: snapshot.id ?? null,
      outcomeId: null,
      detail: { denialEventId: event.id, appealPacketId: appealPacket.id },
      actor: "system",
    });

    logger.info(
      { denialAppealGenerated: true, denialEventId: event.id, appealPacketId: appealPacket.id },
      "denial_appeal_generated",
    );

    return { appealPacket, classification };
  }
}

export const denialRecoveryService = new DenialRecoveryService();

