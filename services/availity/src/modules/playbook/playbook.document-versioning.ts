import type { Prisma, PrismaClient } from "@prisma/client";
import { writePayerIntelligenceAudit } from "../../lib/payer-intelligence-audit.js";

export type PlaybookDocumentAmendmentContext = {
  documentId: string;
  newContent: string;
  playbookExecutionId: string;
  playbookId: string;
  playbookVersion: number;
  actor: string;
  payerId: string;
  caseId?: string | null;
};

/**
 * Applies playbook-amended document text without silent overwrite: bumps `version`, stores full
 * prior `content` under `inputSnapshot._playbookContentHistory`, and writes an audit row.
 */
export async function persistPlaybookAmendedDocument(
  prisma: PrismaClient | Prisma.TransactionClient,
  ctx: PlaybookDocumentAmendmentContext,
): Promise<void> {
  const row = await prisma.priorAuthDocument.findUnique({ where: { id: ctx.documentId } });
  if (!row || row.content === ctx.newContent) return;

  const snap =
    row.inputSnapshot && typeof row.inputSnapshot === "object" && row.inputSnapshot !== null
      ? { ...(row.inputSnapshot as Record<string, unknown>) }
      : {};

  const history = Array.isArray(snap._playbookContentHistory)
    ? [...(snap._playbookContentHistory as unknown[])]
    : [];

  history.push({
    savedAt: new Date().toISOString(),
    priorDocumentVersion: row.version,
    fullPriorContent: row.content,
    playbookExecutionId: ctx.playbookExecutionId,
    playbookId: ctx.playbookId,
    playbookVersion: ctx.playbookVersion,
    actor: ctx.actor,
  });

  await prisma.priorAuthDocument.update({
    where: { id: ctx.documentId },
    data: {
      content: ctx.newContent,
      version: row.version + 1,
      inputSnapshot: {
        ...snap,
        _playbookContentHistory: history,
        _lastPlaybookExecutionId: ctx.playbookExecutionId,
      } as object,
    },
  });

  await writePayerIntelligenceAudit(prisma, {
    action: "prior_auth_document_playbook_amendment",
    payerId: ctx.payerId,
    caseId: ctx.caseId ?? null,
    detail: {
      documentId: ctx.documentId,
      playbookExecutionId: ctx.playbookExecutionId,
      playbookId: ctx.playbookId,
      priorDocumentVersion: row.version,
      nextDocumentVersion: row.version + 1,
    },
    actor: ctx.actor,
  });
}
