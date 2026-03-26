import { z } from "zod";
import type { AvailityEligibilityRequest } from "../types/availity.js";

export const eligibilityRequestSchema = z.object({
  caseId: z.string().optional(),
  payerId: z.string().min(1),
  memberId: z.string().min(1),
  patient: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be YYYY-MM-DD"),
  }),
  provider: z
    .object({
      npi: z.string().optional(),
    })
    .optional(),
});

export const priorAuthRequestSchema = z.object({
  caseId: z.string().optional(),
  packetId: z.string().optional(),
  payload: z.record(z.any()),
});

export type EligibilityRequestInput = z.infer<typeof eligibilityRequestSchema>;
export type PriorAuthRequestInput = z.infer<typeof priorAuthRequestSchema>;

/** @deprecated Use EligibilityRequestInput */
export type EligibilityRequest = EligibilityRequestInput;

/** Map validated HTTP body to the canonical Availity domain shape. */
export function toAvailityEligibilityRequest(
  body: EligibilityRequestInput,
): AvailityEligibilityRequest {
  return {
    payerId: body.payerId,
    memberId: body.memberId,
    patient: body.patient,
    provider: body.provider,
    caseId: body.caseId,
  };
}

/** @deprecated Use PriorAuthRequestInput */
export type PriorAuthSubmitRequest = PriorAuthRequestInput;

export const priorAuthStatusParamsSchema = z.object({
  authId: z.string().min(1),
});
