import { z } from "zod";
import type { AvailityEligibilityRequest } from "../types/availity.js";
export declare const eligibilityRequestSchema: z.ZodObject<{
    caseId: z.ZodOptional<z.ZodString>;
    payerId: z.ZodString;
    memberId: z.ZodString;
    patient: z.ZodObject<{
        firstName: z.ZodString;
        lastName: z.ZodString;
        dob: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        firstName: string;
        lastName: string;
        dob: string;
    }, {
        firstName: string;
        lastName: string;
        dob: string;
    }>;
    provider: z.ZodOptional<z.ZodObject<{
        npi: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        npi?: string | undefined;
    }, {
        npi?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    payerId: string;
    memberId: string;
    patient: {
        firstName: string;
        lastName: string;
        dob: string;
    };
    caseId?: string | undefined;
    provider?: {
        npi?: string | undefined;
    } | undefined;
}, {
    payerId: string;
    memberId: string;
    patient: {
        firstName: string;
        lastName: string;
        dob: string;
    };
    caseId?: string | undefined;
    provider?: {
        npi?: string | undefined;
    } | undefined;
}>;
export declare const priorAuthRequestSchema: z.ZodObject<{
    caseId: z.ZodOptional<z.ZodString>;
    packetId: z.ZodOptional<z.ZodString>;
    payload: z.ZodRecord<z.ZodString, z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    payload: Record<string, any>;
    caseId?: string | undefined;
    packetId?: string | undefined;
}, {
    payload: Record<string, any>;
    caseId?: string | undefined;
    packetId?: string | undefined;
}>;
export type EligibilityRequestInput = z.infer<typeof eligibilityRequestSchema>;
export type PriorAuthRequestInput = z.infer<typeof priorAuthRequestSchema>;
/** @deprecated Use EligibilityRequestInput */
export type EligibilityRequest = EligibilityRequestInput;
/** Map validated HTTP body to the canonical Availity domain shape. */
export declare function toAvailityEligibilityRequest(body: EligibilityRequestInput): AvailityEligibilityRequest;
/** @deprecated Use PriorAuthRequestInput */
export type PriorAuthSubmitRequest = PriorAuthRequestInput;
export declare const priorAuthStatusParamsSchema: z.ZodObject<{
    authId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    authId: string;
}, {
    authId: string;
}>;
//# sourceMappingURL=eligibility.d.ts.map