import { z } from "zod";

export const ingestManualBodySchema = z.object({
  payerId: z.string().min(1),
  planName: z.string().optional(),
  /** Relative path under configured trident manuals root, e.g. `aetna/dme.txt`. */
  relativePath: z.string().min(1).optional(),
  /** Raw manual text (optional if `relativePath` is set). */
  rawText: z.string().optional(),
  title: z.string().optional(),
  sourceType: z.enum(["PDF", "DOCX", "TXT"]).optional(),
  versionLabel: z.string().optional(),
  /** ISO date or datetime string */
  effectiveDate: z.string().optional(),
  /** When true, persist `ManualRequirement` rows; default false for preview-only flows. */
  persistExtraction: z.boolean().optional(),
  /** When true with `MANUAL_EXTRACTION_LLM` + `OPENAI_API_KEY`, merge LLM candidates (always pending review). */
  useLlm: z.boolean().optional(),
});

export const extractPreviewBodySchema = z.object({
  rawText: z.string().min(1),
  /** Optional LLM candidates (feature-flagged server-side). */
  useLlm: z.boolean().optional(),
});

export const learningEvaluateBodySchema = z.object({
  periodDays: z.coerce.number().int().min(7).max(730).optional().default(90),
  payerId: z.string().optional(),
});

/** Optional override of `TRIDENT_MANUALS_PATH` / default `../trident/manuals` from package cwd. */
export const manualScanBodySchema = z.object({
  root: z.string().min(1).optional(),
});

export const manualExtractPersistBodySchema = z.object({
  useLlm: z.boolean().optional(),
});

export const manualExtractRequirementsBodySchema = z.object({
  manualId: z.string().min(1),
  useLlm: z.boolean().optional(),
});

export const governanceDecisionBodySchema = z.object({
  decidedBy: z.string().min(1).optional(),
  notes: z.string().optional(),
  /** @deprecated use decidedBy */
  actor: z.string().min(1).optional(),
  /** @deprecated use notes */
  reason: z.string().optional(),
});

export const manualRequirementDecisionBodySchema = z.object({
  decidedBy: z.string().min(1).optional(),
  /** Optional audit note (not persisted on the row). */
  notes: z.string().optional(),
  /** @deprecated */
  actor: z.string().min(1).optional(),
  /** @deprecated */
  reason: z.string().optional(),
});

export type IngestManualBody = z.infer<typeof ingestManualBodySchema>;
export type ExtractPreviewBody = z.infer<typeof extractPreviewBodySchema>;
export type LearningEvaluateBody = z.infer<typeof learningEvaluateBodySchema>;
export type ManualScanBody = z.infer<typeof manualScanBodySchema>;
export type ManualExtractPersistBody = z.infer<typeof manualExtractPersistBodySchema>;
export type ManualExtractRequirementsBody = z.infer<typeof manualExtractRequirementsBodySchema>;
export type ManualRequirementDecisionBody = z.infer<typeof manualRequirementDecisionBodySchema>;
