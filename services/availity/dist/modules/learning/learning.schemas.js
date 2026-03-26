"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.manualRequirementDecisionBodySchema = exports.governanceDecisionBodySchema = exports.manualExtractRequirementsBodySchema = exports.manualExtractPersistBodySchema = exports.manualScanBodySchema = exports.learningEvaluateBodySchema = exports.extractPreviewBodySchema = exports.ingestManualBodySchema = void 0;
const zod_1 = require("zod");
exports.ingestManualBodySchema = zod_1.z.object({
    payerId: zod_1.z.string().min(1),
    planName: zod_1.z.string().optional(),
    /** Relative path under configured trident manuals root, e.g. `aetna/dme.txt`. */
    relativePath: zod_1.z.string().min(1).optional(),
    /** Raw manual text (optional if `relativePath` is set). */
    rawText: zod_1.z.string().optional(),
    title: zod_1.z.string().optional(),
    sourceType: zod_1.z.enum(["PDF", "DOCX", "TXT"]).optional(),
    versionLabel: zod_1.z.string().optional(),
    /** ISO date or datetime string */
    effectiveDate: zod_1.z.string().optional(),
    /** When true, persist `ManualRequirement` rows; default false for preview-only flows. */
    persistExtraction: zod_1.z.boolean().optional(),
    /** When true with `MANUAL_EXTRACTION_LLM` + `OPENAI_API_KEY`, merge LLM candidates (always pending review). */
    useLlm: zod_1.z.boolean().optional(),
});
exports.extractPreviewBodySchema = zod_1.z.object({
    rawText: zod_1.z.string().min(1),
    /** Optional LLM candidates (feature-flagged server-side). */
    useLlm: zod_1.z.boolean().optional(),
});
exports.learningEvaluateBodySchema = zod_1.z.object({
    periodDays: zod_1.z.coerce.number().int().min(7).max(730).optional().default(90),
    payerId: zod_1.z.string().optional(),
});
/** Optional override of `TRIDENT_MANUALS_PATH` / default `../trident/manuals` from package cwd. */
exports.manualScanBodySchema = zod_1.z.object({
    root: zod_1.z.string().min(1).optional(),
});
exports.manualExtractPersistBodySchema = zod_1.z.object({
    useLlm: zod_1.z.boolean().optional(),
});
exports.manualExtractRequirementsBodySchema = zod_1.z.object({
    manualId: zod_1.z.string().min(1),
    useLlm: zod_1.z.boolean().optional(),
});
exports.governanceDecisionBodySchema = zod_1.z.object({
    decidedBy: zod_1.z.string().min(1).optional(),
    notes: zod_1.z.string().optional(),
    /** @deprecated use decidedBy */
    actor: zod_1.z.string().min(1).optional(),
    /** @deprecated use notes */
    reason: zod_1.z.string().optional(),
});
exports.manualRequirementDecisionBodySchema = zod_1.z.object({
    decidedBy: zod_1.z.string().min(1).optional(),
    /** Optional audit note (not persisted on the row). */
    notes: zod_1.z.string().optional(),
    /** @deprecated */
    actor: zod_1.z.string().min(1).optional(),
    /** @deprecated */
    reason: zod_1.z.string().optional(),
});
//# sourceMappingURL=learning.schemas.js.map