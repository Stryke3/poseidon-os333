import { z } from "zod";

export const documentGeneratorInputSchema = z.object({
  patient: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be YYYY-MM-DD"),
  }),
  diagnosis: z.string().optional(),
  device: z.string().min(1),
  justification: z.string().optional(),
  limitations: z.string().optional(),
  failedTreatments: z.string().optional(),
  physician: z.object({
    name: z.string().min(1),
    npi: z.string().optional(),
  }),
  hcpcs: z.string().optional(),
  orderDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "orderDate must be YYYY-MM-DD")
    .optional(),
});

export type DocumentGeneratorInput = z.infer<typeof documentGeneratorInputSchema>;

export const generateAndSubmitPriorAuthBodySchema = z.object({
  caseId: z.string().min(1),
  input: documentGeneratorInputSchema,
});

export const clinicalInputSchema = z.object({
  diagnosis: z
    .array(
      z.object({
        code: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .min(1),
  device: z.object({
    category: z.string().min(1),
    hcpcs: z.string().optional(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    quantity: z.number().int().positive().optional(),
  }),
  physician: z.object({
    name: z.string().min(1),
    npi: z.string().optional(),
    practice: z.string().optional(),
  }),
  clinicalSummaryLines: z.array(z.string()).optional(),
  clinicalJustification: z.string().optional(),
  limitations: z.string().optional(),
  failedTreatments: z.string().optional(),
  orderDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "orderDate must be YYYY-MM-DD")
    .optional(),
  additionalNotes: z.string().optional(),
  attachmentMetadata: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        mimeType: z.string().optional(),
      }),
    )
    .optional(),
  payerRuleProfileId: z.string().optional(),
});

export const createPacketBodySchema = z.object({
  caseId: z.string().min(1),
  deviceType: z.string().optional(),
  clinical: clinicalInputSchema,
});

export const generatePacketBodySchema = z.object({
  clinical: clinicalInputSchema,
});

export const submitPacketPriorAuthBodySchema = z.object({
  payload: z.record(z.any()),
});

export type CreatePacketBody = z.infer<typeof createPacketBodySchema>;
export type GeneratePacketBody = z.infer<typeof generatePacketBodySchema>;
export type GenerateAndSubmitPriorAuthBody = z.infer<
  typeof generateAndSubmitPriorAuthBodySchema
>;
