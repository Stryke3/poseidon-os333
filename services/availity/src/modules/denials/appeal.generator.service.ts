import type { DenialEventPayload, DenialClassificationResult } from "./denial.types.js";

type PacketDoc = {
  type: string;
  content: string;
};

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function excerpt(text: string, maxLen: number): string {
  const t = normalizeWhitespace(text ?? "");
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen) + "...";
}

/**
 * Generate appeal/resubmission draft using only:
 * - denial code/reason text
 * - packet document content (no invented clinical facts)
 * - deterministic classification/recovery instructions
 *
 * Every string is traceable to one of the inputs; no hidden medical reasoning.
 */
export function generateAppealDraft(params: {
  denial: DenialEventPayload;
  classification: DenialClassificationResult;
  packetDocs: PacketDoc[];
  classificationSnapshotId?: string | null;
}): {
  letterText: string;
  rebuttalPoints: string[];
  attachmentChecklist: string[];
  payload: Record<string, unknown>;
} {
  const { denial, classification, packetDocs, classificationSnapshotId } = params;

  const docsByType = new Map(packetDocs.map((d) => [String(d.type).toUpperCase(), d.content]));
  const getDocExcerpt = (docType: string, maxLen: number) => {
    const t = docsByType.get(normalizeWhitespace(docType).toUpperCase());
    if (!t) return "";
    return excerpt(t, maxLen);
  };

  const requiredAttachments = classification.requiredAttachments;
  const denialReason = denial.denialReasonText?.trim() ? denial.denialReasonText.trim() : "";

  const letterSections: string[] = [];
  letterSections.push(`DENIAL-TO-RECOVERY DRAFT`);
  letterSections.push(`CaseId: ${denial.caseId ?? "(none)"}`);
  letterSections.push(`PayerId: ${denial.payerId}`);
  if (denial.denialCode) letterSections.push(`DenialCode: ${denial.denialCode}`);
  letterSections.push(`DenialReason: ${denialReason}`);
  letterSections.push(`Category: ${classification.category} (confidence ${classification.confidence.toFixed(2)})`);
  letterSections.push(`RecoveryType: ${classification.recoveryType}`);
  if (classificationSnapshotId) {
    letterSections.push(`ClassificationSnapshotId: ${classificationSnapshotId}`);
  }

  letterSections.push("");
  letterSections.push(`Requested recovery fixes (deterministic):`);
  for (const f of classification.requiredFixes) letterSections.push(`- ${f}`);

  letterSections.push("");
  letterSections.push(`Evidence excerpts used from packet documents (no fabricated clinical facts):`);
  const evidenceExcerpts: string[] = [];
  for (const attachType of requiredAttachments) {
    const excerptText = getDocExcerpt(attachType, 400);
    if (excerptText) {
      const label = `${attachType} excerpt:`;
      evidenceExcerpts.push(`${label} ${excerptText}`);
    }
  }
  if (evidenceExcerpts.length === 0) {
    letterSections.push(`- (No packet document content found for required attachment types.)`);
  } else {
    for (const e of evidenceExcerpts) letterSections.push(`- ${e}`);
  }

  letterSections.push("");
  letterSections.push(`Escalation steps (deterministic):`);
  for (const s of classification.escalationSteps) letterSections.push(`- ${s}`);

  const letterText = letterSections.join("\n");

  const rebuttalPoints: string[] = [];
  // Deterministic, traceable bullets: tie to document excerpts.
  for (const attachType of requiredAttachments) {
    const doc = getDocExcerpt(attachType, 240);
    if (!doc) continue;
    rebuttalPoints.push(`${attachType}: ${doc}`);
  }

  const payload: Record<string, unknown> = {
    denial,
    classification: {
      ...classification,
      requiredFixes: [...classification.requiredFixes],
      requiredAttachments: [...classification.requiredAttachments],
      escalationSteps: [...classification.escalationSteps],
    },
    classificationSnapshotId: classificationSnapshotId ?? null,
    packetDocTypesProvided: packetDocs.map((d) => d.type),
    traceabilityNote: "All drafted strings use denial text + packet document content excerpts only.",
  };

  return {
    letterText,
    rebuttalPoints,
    attachmentChecklist: [...requiredAttachments],
    payload,
  };
}

