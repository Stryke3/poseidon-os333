import { z } from "zod";
export declare const ingestManualBodySchema: z.ZodObject<{
    payerId: z.ZodString;
    planName: z.ZodOptional<z.ZodString>;
    /** Relative path under configured trident manuals root, e.g. `aetna/dme.txt`. */
    relativePath: z.ZodOptional<z.ZodString>;
    /** Raw manual text (optional if `relativePath` is set). */
    rawText: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    sourceType: z.ZodOptional<z.ZodEnum<["PDF", "DOCX", "TXT"]>>;
    versionLabel: z.ZodOptional<z.ZodString>;
    /** ISO date or datetime string */
    effectiveDate: z.ZodOptional<z.ZodString>;
    /** When true, persist `ManualRequirement` rows; default false for preview-only flows. */
    persistExtraction: z.ZodOptional<z.ZodBoolean>;
    /** When true with `MANUAL_EXTRACTION_LLM` + `OPENAI_API_KEY`, merge LLM candidates (always pending review). */
    useLlm: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    payerId: string;
    planName?: string | undefined;
    title?: string | undefined;
    relativePath?: string | undefined;
    rawText?: string | undefined;
    sourceType?: "PDF" | "DOCX" | "TXT" | undefined;
    versionLabel?: string | undefined;
    effectiveDate?: string | undefined;
    persistExtraction?: boolean | undefined;
    useLlm?: boolean | undefined;
}, {
    payerId: string;
    planName?: string | undefined;
    title?: string | undefined;
    relativePath?: string | undefined;
    rawText?: string | undefined;
    sourceType?: "PDF" | "DOCX" | "TXT" | undefined;
    versionLabel?: string | undefined;
    effectiveDate?: string | undefined;
    persistExtraction?: boolean | undefined;
    useLlm?: boolean | undefined;
}>;
export declare const extractPreviewBodySchema: z.ZodObject<{
    rawText: z.ZodString;
    /** Optional LLM candidates (feature-flagged server-side). */
    useLlm: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    rawText: string;
    useLlm?: boolean | undefined;
}, {
    rawText: string;
    useLlm?: boolean | undefined;
}>;
export declare const learningEvaluateBodySchema: z.ZodObject<{
    periodDays: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    payerId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    periodDays: number;
    payerId?: string | undefined;
}, {
    payerId?: string | undefined;
    periodDays?: number | undefined;
}>;
/** Optional override of `TRIDENT_MANUALS_PATH` / default `../trident/manuals` from package cwd. */
export declare const manualScanBodySchema: z.ZodObject<{
    root: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    root?: string | undefined;
}, {
    root?: string | undefined;
}>;
export declare const manualExtractPersistBodySchema: z.ZodObject<{
    useLlm: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    useLlm?: boolean | undefined;
}, {
    useLlm?: boolean | undefined;
}>;
export declare const manualExtractRequirementsBodySchema: z.ZodObject<{
    manualId: z.ZodString;
    useLlm: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    manualId: string;
    useLlm?: boolean | undefined;
}, {
    manualId: string;
    useLlm?: boolean | undefined;
}>;
export declare const governanceDecisionBodySchema: z.ZodObject<{
    decidedBy: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    /** @deprecated use decidedBy */
    actor: z.ZodOptional<z.ZodString>;
    /** @deprecated use notes */
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    actor?: string | undefined;
    reason?: string | undefined;
    notes?: string | undefined;
    decidedBy?: string | undefined;
}, {
    actor?: string | undefined;
    reason?: string | undefined;
    notes?: string | undefined;
    decidedBy?: string | undefined;
}>;
export declare const manualRequirementDecisionBodySchema: z.ZodObject<{
    decidedBy: z.ZodOptional<z.ZodString>;
    /** Optional audit note (not persisted on the row). */
    notes: z.ZodOptional<z.ZodString>;
    /** @deprecated */
    actor: z.ZodOptional<z.ZodString>;
    /** @deprecated */
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    actor?: string | undefined;
    reason?: string | undefined;
    notes?: string | undefined;
    decidedBy?: string | undefined;
}, {
    actor?: string | undefined;
    reason?: string | undefined;
    notes?: string | undefined;
    decidedBy?: string | undefined;
}>;
export type IngestManualBody = z.infer<typeof ingestManualBodySchema>;
export type ExtractPreviewBody = z.infer<typeof extractPreviewBodySchema>;
export type LearningEvaluateBody = z.infer<typeof learningEvaluateBodySchema>;
export type ManualScanBody = z.infer<typeof manualScanBodySchema>;
export type ManualExtractPersistBody = z.infer<typeof manualExtractPersistBodySchema>;
export type ManualExtractRequirementsBody = z.infer<typeof manualExtractRequirementsBodySchema>;
export type ManualRequirementDecisionBody = z.infer<typeof manualRequirementDecisionBodySchema>;
//# sourceMappingURL=learning.schemas.d.ts.map