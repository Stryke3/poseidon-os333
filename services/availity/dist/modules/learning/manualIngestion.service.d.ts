import type { PrismaClient } from "@prisma/client";
import type { IngestManualBody } from "./learning.schemas.js";
export declare function ingestPayerManual(prisma: PrismaClient, body: IngestManualBody, actor: string): Promise<{
    manualId: string;
    requirementsCount: number;
    contentFingerprint: string;
}>;
export type LocalPayerManualIngestionResult = {
    root: string;
    filesScanned: number;
    filesIngested: number;
    duplicatesSkipped: number;
    errors: {
        sourcePath: string;
        error: string;
    }[];
};
/**
 * Recursively scan `services/trident/manuals` and ingest local payer manuals.
 * Idempotent: skips ingestion when `contentFingerprint` matches an existing record.
 * Never crashes the whole process if one file fails.
 */
export declare function scanAndIngestLocalPayerManuals(prisma: PrismaClient, opts?: {
    root?: string;
    actor?: string;
}): Promise<LocalPayerManualIngestionResult>;
export declare class ManualIngestionService {
    private readonly db;
    constructor(db?: PrismaClient);
    ingestAll(opts?: {
        root?: string;
        actor?: string;
    }): Promise<LocalPayerManualIngestionResult>;
}
export declare const manualIngestionService: ManualIngestionService;
export type AutoParsePendingManualsResult = {
    processed: number;
    failed: {
        manualId: string;
        error: string;
    }[];
};
/**
 * For every `PayerManual` with `parsedStatus=PENDING`:
 * - extract deterministic + (optional) LLM candidates
 * - route everything into the review queue (no auto-activation)
 * - persist with excerpt traceability
 * - set `parsedStatus=PARSED`
 */
export declare function parsePendingPayerManuals(prisma: PrismaClient, opts?: {
    actor?: string;
    useLlm?: boolean;
}): Promise<AutoParsePendingManualsResult>;
//# sourceMappingURL=manualIngestion.service.d.ts.map