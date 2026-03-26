import { z } from "zod";

/** Strict case payload for scoring (e.g. after normalization). */
export const scoreCaseSchema = z.object({
  caseId: z.string().optional(),
  payerId: z.string().min(1),
  planName: z.string().optional(),
  deviceCategory: z.string().optional(),
  hcpcsCode: z.string().optional(),
  diagnosisCode: z.string().optional(),
  physicianName: z.string().optional(),
  facilityName: z.string().optional(),
  hasLmn: z.boolean(),
  hasSwo: z.boolean(),
  hasClinicals: z.boolean(),
});

/**
 * HTTP body for `POST /score`: same as {@link scoreCaseSchema} but doc flags may be omitted
 * (filled from `packetId` or defaulted false). Includes legacy / helper fields.
 */
export const scorePriorAuthBodySchema = scoreCaseSchema
  .partial({ hasLmn: true, hasSwo: true, hasClinicals: true })
  .extend({
    packetId: z.string().optional(),
    /** @deprecated prefer `hcpcsCode` */
    hcpcs: z.string().optional(),
    diagnosisCodes: z.array(z.string()).optional(),
  });

export const ingestOutcomeSchema = z.object({
  caseId: z.string().optional(),
  payerId: z.string().min(1),
  planName: z.string().optional(),
  deviceCategory: z.string().optional(),
  hcpcsCode: z.string().optional(),
  diagnosisCode: z.string().optional(),
  physicianName: z.string().optional(),
  facilityName: z.string().optional(),
  outcome: z.enum(["APPROVED", "DENIED", "PENDED"]),
  denialReason: z.string().optional(),
  submittedAt: z.string().optional(),
  resolvedAt: z.string().optional(),
});

/**
 * Persisted outcome ingest: extends {@link ingestOutcomeSchema} with multi-code input,
 * optional turnaround override, and legacy `hcpcs` alias.
 */
export const ingestOutcomeBodySchema = ingestOutcomeSchema.extend({
  diagnosisCodes: z.array(z.string()).optional(),
  turnaroundDays: z.number().int().nonnegative().optional(),
  /** @deprecated prefer `hcpcsCode` */
  hcpcs: z.string().optional(),
  /** Governance / learning correlation (optional; else resolved from latest case playbook execution). */
  playbookExecutionId: z.string().optional(),
  playbookId: z.string().optional(),
  playbookVersion: z.coerce.number().int().optional(),
  /** Snapshot of payer rule ids / versions in effect at submission. */
  payerRuleSnapshot: z.record(z.string(), z.any()).optional(),
});

export const createPayerRuleSchema = z.object({
  payerId: z.string().min(1),
  planName: z.string().optional(),
  deviceCategory: z.string().optional(),
  hcpcsCode: z.string().optional(),
  diagnosisCode: z.string().optional(),
  requiresLmn: z.boolean().default(false),
  requiresSwo: z.boolean().default(false),
  requiresClinicals: z.boolean().default(false),
  requiresAuth: z.boolean().default(true),
  notes: z.string().optional(),
});

export const createPayerRuleBodySchema = createPayerRuleSchema.extend({
  active: z.boolean().optional(),
});

export type ScoreCaseParsed = z.infer<typeof scoreCaseSchema>;
export type ScorePriorAuthBody = z.infer<typeof scorePriorAuthBodySchema>;
export type IngestOutcomeParsed = z.infer<typeof ingestOutcomeSchema>;
export type IngestOutcomeBody = z.infer<typeof ingestOutcomeBodySchema>;
export type CreatePayerRuleParsed = z.infer<typeof createPayerRuleSchema>;
export type CreatePayerRuleBody = z.infer<typeof createPayerRuleBodySchema>;
