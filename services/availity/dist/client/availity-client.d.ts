import type { NormalizedEligibilityResponse } from "../types/availity.js";
export type EligibilityClientInput = {
    caseId: string;
    payerId: string;
    memberId: string;
    patient: {
        firstName: string;
        lastName: string;
        dob: string;
    };
    provider?: {
        npi?: string;
    };
};
type RequestOptions = {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
    caseId?: string;
    actor?: string;
    action: string;
};
export declare class AvailityClient {
    private request;
    /** Raw POST (legacy / tests) — returns unnormalized Availity JSON. */
    executeRaw(options: Omit<RequestOptions, "method"> & {
        method?: "GET" | "POST";
    }): Promise<unknown>;
    private buildEligibilityWireBody;
    getEligibility(input: EligibilityClientInput, actor?: string): Promise<NormalizedEligibilityResponse>;
    submitPriorAuth(payload: Record<string, unknown>, caseId?: string, actor?: string): Promise<unknown>;
    getPriorAuthStatus(authId: string, caseId?: string, actor?: string): Promise<unknown>;
}
export declare const availityClient: AvailityClient;
export interface LegacyClientOpts {
    actor?: string;
    caseId?: string;
}
/** @deprecated Prefer availityClient.getEligibility for domain-shaped requests. */
export declare function checkEligibility(payload: unknown, opts?: LegacyClientOpts): Promise<unknown>;
export declare function submitPriorAuth(payload: unknown, opts?: LegacyClientOpts): Promise<unknown>;
export declare function getPriorAuthStatus(authId: string, opts?: LegacyClientOpts): Promise<unknown>;
export {};
//# sourceMappingURL=availity-client.d.ts.map