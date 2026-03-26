import { z } from "zod";

export const playbookStrategyJsonSchema = z
  .object({
    requiredDocuments: z.array(z.string()).optional(),
    timing: z.enum(["IMMEDIATE", "DELAY", "REVIEW"]).optional(),
  })
  .default({});

export const playbookDocumentRulesJsonSchema = z
  .object({
    lmnAdditions: z.array(z.string()).optional(),
    clinicalAdditions: z.array(z.string()).optional(),
  })
  .default({});

export const playbookEscalationRulesJsonSchema = z
  .object({
    onDenial: z.array(z.string()).optional(),
    peerToPeer: z.boolean().optional(),
  })
  .default({});

export const createPlaybookBodySchema = z.object({
  payerId: z.string().min(1),
  planName: z.string().optional(),
  deviceCategory: z.string().optional(),
  hcpcsCode: z.string().optional(),
  diagnosisCode: z.string().optional(),
  strategy: z.unknown().optional(),
  documentRules: z.unknown().optional(),
  escalationRules: z.unknown().optional(),
  version: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

export const executePlaybookBodySchema = z.object({
  playbookId: z.string().optional(),
  packetId: z.string().min(1),
  runPayerScore: z.boolean().optional(),
});

export const matchPlaybooksQuerySchema = z.object({
  payerId: z.string().min(1),
  planName: z.string().optional(),
  deviceCategory: z.string().optional(),
  hcpcsCode: z.string().optional(),
  diagnosisCodes: z.string().optional(),
});

export type CreatePlaybookBody = z.infer<typeof createPlaybookBodySchema>;
export type ExecutePlaybookBody = z.infer<typeof executePlaybookBodySchema>;
