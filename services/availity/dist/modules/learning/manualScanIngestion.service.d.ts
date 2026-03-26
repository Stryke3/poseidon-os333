import type { PrismaClient } from "@prisma/client";
export type TridentManualScanResult = {
    root: string;
    scannedFiles: number;
    skippedUnchanged: number;
    inserted: number;
    updated: number;
    failed: {
        relativePath: string;
        error: string;
    }[];
};
/** Normalize relative path to POSIX-style for stable `sourcePath` storage. */
export declare function toPosixRelative(rel: string): string;
/**
 * Payer key from folder layout under the manuals root, or from the filename stem if the file sits at root.
 * Example: `aetna/dme/foo.txt` → `AETNA`; `UnitedHealthcare-guide.pdf` → `UNITEDHEALTHCARE_GUIDE`
 */
export declare function inferPayerKeyFromRelativePath(relativePosixPath: string): string;
/**
 * Recursively scans `services/trident/manuals` (or `config.governance.tridentManualsRoot`),
 * extracts text, and upserts `PayerManual` rows. Idempotent: same `sourcePath` + `contentFingerprint` → skip.
 * New or changed files get `parsedStatus` **PENDING** (raw text only; no requirement extraction).
 */
export declare function scanAndIngestTridentManuals(prisma: PrismaClient, opts?: {
    root?: string;
    actor?: string;
}): Promise<TridentManualScanResult>;
//# sourceMappingURL=manualScanIngestion.service.d.ts.map