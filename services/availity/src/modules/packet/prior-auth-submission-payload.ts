import type { PrismaClient } from "@prisma/client";
import type { PlaybookAttachment } from "../playbook/playbook.types.js";
import { persistPlaybookAmendedDocument } from "../playbook/playbook.document-versioning.js";

/** Reads `attachments[]` from a stored prior-auth packet JSON payload for playbook apply. */
export function attachmentsFromStoredPayload(payload: unknown): PlaybookAttachment[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = (payload as Record<string, unknown>).attachments;
  if (!Array.isArray(raw)) return [];
  const out: PlaybookAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    out.push({
      type: String(o.type ?? ""),
      content: String(o.content ?? ""),
    });
  }
  return out;
}

export function mergeAttachmentsIntoStoredPayload(
  payload: Record<string, unknown>,
  attachments: PlaybookAttachment[],
): Record<string, unknown> {
  return { ...payload, attachments };
}

export type SyncAttachmentsAfterPlaybookOpts = {
  documentIds: string[];
  attachments: PlaybookAttachment[];
  playbookExecutionId: string;
  playbookId: string;
  playbookVersion: number;
  payerId: string;
  caseId: string;
  actor: string;
};

/**
 * Aligns `PriorAuthDocument.content` after playbook apply using {@link persistPlaybookAmendedDocument}
 * (version bump + prior content preserved under `inputSnapshot._playbookContentHistory`).
 */
export async function syncPriorAuthDocumentsFromAttachments(
  prisma: PrismaClient,
  opts: SyncAttachmentsAfterPlaybookOpts,
): Promise<void> {
  const { documentIds, attachments } = opts;
  if (documentIds.length === 0) return;
  const byType = new Map(attachments.map((a) => [a.type, a.content]));
  const rows = await prisma.priorAuthDocument.findMany({
    where: { id: { in: documentIds } },
    select: { id: true, type: true, content: true },
  });
  for (const row of rows) {
    const next = byType.get(row.type);
    if (next !== undefined && next !== row.content) {
      await persistPlaybookAmendedDocument(prisma, {
        documentId: row.id,
        newContent: next,
        playbookExecutionId: opts.playbookExecutionId,
        playbookId: opts.playbookId,
        playbookVersion: opts.playbookVersion,
        actor: opts.actor,
        payerId: opts.payerId,
        caseId: opts.caseId,
      });
    }
  }
}
