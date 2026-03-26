import { z } from "zod";
import type { DenialIntakeInput, RecoveryType } from "./denial.types.js";

export const denialIntakeSchema = z.object({
  caseId: z.string().optional(),
  payerId: z.string().min(1),
  planName: z.string().optional(),
  authId: z.string().optional(),
  denialCode: z.string().optional(),
  denialReasonText: z.string().min(1),
  packetId: z.string().optional(),
  playbookId: z.string().optional(),
  playbookVersion: z.number().int().nonnegative().optional(),
  scoreSnapshotId: z.string().optional(),
});

export const denialIntakeBodySchema = denialIntakeSchema;
export type DenialIntakeBody = z.infer<typeof denialIntakeSchema>;
export type DenialIntakeParsed = DenialIntakeBody & DenialIntakeInput;

export const classifyDenialBodySchema = z.object({
  denialEventId: z.string().min(1),
});

export const generateAppealBodySchema = z.object({
  denialEventId: z.string().min(1),
});

export const submitRecoveryBodySchema = z.object({
  appealPacketId: z.string().min(1),
});

export const denialOutcomeBodySchema = z.object({
  appealPacketId: z.string().min(1),
  outcome: z.enum(["OVERTURNED", "UPHELD", "PENDING"]),
  resolvedAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export type DenialOutcomeBody = z.infer<typeof denialOutcomeBodySchema>;

export const denialQueueQuerySchema = z.object({
  status: z.enum(["ALL", "NEEDS_CLASSIFICATION", "READY_TO_APPEAL"]).optional(),
  payerId: z.string().optional(),
});

