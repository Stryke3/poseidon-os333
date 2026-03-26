import type { Case, PriorAuthDocument, PriorAuthPacket, PrismaClient } from "@prisma/client";
import { parseDocumentRefs } from "./packet-hydrate.js";
import type { PayerBehaviorService } from "../payer-behavior/payerBehavior.service.js";
import type { ScorePriorAuthBody } from "../payer-behavior/payerBehavior.schemas.js";
import { computePayerScoreWorkflow } from "../payer-behavior/payerBehavior.rules.js";
import type {
  RiskLevel,
  ScoreCaseExplanation,
  ScoreCaseResult,
} from "../payer-behavior/payerBehavior.types.js";
import type { PacketClinicalInput } from "../../types/packet.js";

export type PriorAuthScoreGateOutcome =
  | { kind: "BLOCKED"; snapshotId: string; score: ScoreCaseResult }
  | { kind: "NEEDS_REVIEW"; snapshotId: string; score: ScoreCaseResult }
  | { kind: "ALLOW_SUBMIT"; snapshotId: string; score: ScoreCaseResult };

export function classifyPriorAuthScoreGate(
  snapshotId: string,
  score: ScoreCaseResult,
): PriorAuthScoreGateOutcome {
  if (score.workflow.blockSubmission) {
    return { kind: "BLOCKED", snapshotId, score };
  }
  if (score.workflow.requiresManualReview) {
    return { kind: "NEEDS_REVIEW", snapshotId, score };
  }
  return { kind: "ALLOW_SUBMIT", snapshotId, score };
}

/** Reconstruct API score shape + workflow from a persisted snapshot row. */
export function payerScoreSnapshotToResult(row: {
  approvalProbability: number;
  riskLevel: string;
  predictedDenialReasons: unknown;
  missingRequirements: unknown;
  recommendedAction: string;
  explanation: unknown;
}): ScoreCaseResult {
  const missingRequirements = Array.isArray(row.missingRequirements)
    ? (row.missingRequirements as string[])
    : [];
  const predictedDenialReasons = Array.isArray(row.predictedDenialReasons)
    ? (row.predictedDenialReasons as string[])
    : [];
  const explanation = Array.isArray(row.explanation)
    ? (row.explanation as ScoreCaseExplanation[])
    : [];
  const riskLevel = row.riskLevel as RiskLevel;
  const workflow = computePayerScoreWorkflow({
    missingRequirements,
    riskLevel,
    recommendedAction: row.recommendedAction,
  });
  return {
    approvalProbability: row.approvalProbability,
    riskLevel,
    predictedDenialReasons,
    missingRequirements,
    recommendedAction: row.recommendedAction,
    explanation,
    workflow,
  };
}

function extractScoreFieldsFromDocumentsAndPayload(
  packet: PriorAuthPacket,
  caseRow: Case,
  documents: PriorAuthDocument[],
): Omit<ScorePriorAuthBody, "packetId"> {
  for (const doc of documents) {
    const raw = doc.inputSnapshot;
    if (raw && typeof raw === "object" && raw !== null && "clinical" in raw) {
      const snap = raw as Record<string, unknown>;
      const clinical = snap.clinical as PacketClinicalInput | undefined;
      const snapCase = snap.case as { payerId?: string } | undefined;
      if (clinical?.diagnosis?.length && clinical.device) {
        return {
          caseId: caseRow.id,
          payerId: snapCase?.payerId ?? caseRow.payerId,
          deviceCategory: clinical.device.category,
          hcpcsCode: clinical.device.hcpcs,
          diagnosisCode: clinical.diagnosis[0]?.code,
          diagnosisCodes: clinical.diagnosis.map((d) => d.code),
          physicianName: clinical.physician?.name,
        };
      }
    }
  }

  const payload = packet.payload as Record<string, unknown>;
  const physician = payload.physician as { name?: string } | undefined;
  const device = payload.device;
  const deviceCategory =
    typeof device === "string" && device.trim()
      ? device.trim()
      : typeof device === "object" && device !== null && "category" in device
        ? String((device as { category?: string }).category ?? "").trim() || undefined
        : undefined;
  const hcpcsFromNested =
    typeof device === "object" && device !== null && "hcpcs" in device
      ? (device as { hcpcs?: string }).hcpcs?.trim() || undefined
      : undefined;
  const hcpcsTop =
    typeof payload.hcpcs === "string" ? payload.hcpcs.trim() || undefined : undefined;

  let diagnosisCode: string | undefined;
  if (typeof payload.diagnosis === "string") {
    diagnosisCode = payload.diagnosis.trim() || undefined;
  } else if (
    payload.diagnosis &&
    typeof payload.diagnosis === "object" &&
    "code" in payload.diagnosis
  ) {
    diagnosisCode =
      String((payload.diagnosis as { code?: string }).code ?? "").trim() || undefined;
  }

  return {
    caseId: caseRow.id,
    payerId: caseRow.payerId,
    deviceCategory,
    hcpcsCode: hcpcsTop ?? hcpcsFromNested,
    diagnosisCode,
    physicianName: physician?.name,
  };
}

export async function buildScorePriorAuthBodyFromPacket(
  prisma: PrismaClient,
  packetId: string,
): Promise<ScorePriorAuthBody> {
  const packet = await prisma.priorAuthPacket.findUnique({
    where: { id: packetId },
  });
  if (!packet) {
    throw new Error("PACKET_NOT_FOUND");
  }
  const caseRow = await prisma.case.findUnique({ where: { id: packet.caseId } });
  if (!caseRow) {
    throw new Error("CASE_NOT_FOUND");
  }
  const ids = parseDocumentRefs(packet.documents);
  const documents =
    ids.length > 0
      ? await prisma.priorAuthDocument.findMany({ where: { id: { in: ids } } })
      : [];
  const base = extractScoreFieldsFromDocumentsAndPayload(packet, caseRow, documents);
  return {
    ...base,
    packetId: packet.id,
  };
}

/**
 * Runs payer behavior scoring for a packet, persists `payerScoreSnapshotId` on the packet, and
 * returns the gate outcome (block / manual review / allow Availity submit).
 */
export async function scorePacketForPriorAuthGate(
  prisma: PrismaClient,
  payerBehavior: PayerBehaviorService,
  packetId: string,
  actor: string,
): Promise<PriorAuthScoreGateOutcome> {
  const body = await buildScorePriorAuthBodyFromPacket(prisma, packetId);
  const { snapshot, score } = await payerBehavior.scorePriorAuth(body, actor);
  await prisma.priorAuthPacket.update({
    where: { id: packetId },
    data: { payerScoreSnapshotId: snapshot.id },
  });
  return classifyPriorAuthScoreGate(snapshot.id, score);
}

export async function scorePriorAuthSubmissionContext(
  prisma: PrismaClient,
  payerBehavior: PayerBehaviorService,
  opts: { packetId?: string; caseId?: string },
  actor: string,
): Promise<{ outcome: PriorAuthScoreGateOutcome; resolvedPacketId: string | null }> {
  let pid = opts.packetId;
  if (!pid && opts.caseId) {
    const latest = await prisma.priorAuthPacket.findFirst({
      where: { caseId: opts.caseId },
      orderBy: { updatedAt: "desc" },
    });
    pid = latest?.id;
  }
  if (pid) {
    const outcome = await scorePacketForPriorAuthGate(prisma, payerBehavior, pid, actor);
    return { outcome, resolvedPacketId: pid };
  }
  if (opts.caseId) {
    const c = await prisma.case.findUnique({ where: { id: opts.caseId } });
    if (!c) {
      throw new Error("CASE_NOT_FOUND");
    }
    const { snapshot, score } = await payerBehavior.scorePriorAuth(
      {
        caseId: c.id,
        payerId: c.payerId,
        hasLmn: false,
        hasSwo: false,
        hasClinicals: false,
      },
      actor,
    );
    return {
      outcome: classifyPriorAuthScoreGate(snapshot.id, score),
      resolvedPacketId: null,
    };
  }
  throw new Error("NO_SCORING_CONTEXT");
}
