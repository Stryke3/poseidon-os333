import type { PrismaClient } from "@prisma/client";
import type { PlaybookAttachment } from "../playbook/playbook.types.js";
/** Reads `attachments[]` from a stored prior-auth packet JSON payload for playbook apply. */
export declare function attachmentsFromStoredPayload(payload: unknown): PlaybookAttachment[];
export declare function mergeAttachmentsIntoStoredPayload(payload: Record<string, unknown>, attachments: PlaybookAttachment[]): Record<string, unknown>;
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
export declare function syncPriorAuthDocumentsFromAttachments(prisma: PrismaClient, opts: SyncAttachmentsAfterPlaybookOpts): Promise<void>;
//# sourceMappingURL=prior-auth-submission-payload.d.ts.map