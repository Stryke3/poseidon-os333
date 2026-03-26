import type { Prisma, PrismaClient } from "@prisma/client";
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
export declare function persistPlaybookAmendedDocument(prisma: PrismaClient | Prisma.TransactionClient, ctx: PlaybookDocumentAmendmentContext): Promise<void>;
//# sourceMappingURL=playbook.document-versioning.d.ts.map