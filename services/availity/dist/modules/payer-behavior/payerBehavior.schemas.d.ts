import { z } from "zod";
/** Strict case payload for scoring (e.g. after normalization). */
export declare const scoreCaseSchema: z.ZodObject<{
    caseId: z.ZodOptional<z.ZodString>;
    payerId: z.ZodString;
    planName: z.ZodOptional<z.ZodString>;
    deviceCategory: z.ZodOptional<z.ZodString>;
    hcpcsCode: z.ZodOptional<z.ZodString>;
    diagnosisCode: z.ZodOptional<z.ZodString>;
    physicianName: z.ZodOptional<z.ZodString>;
    facilityName: z.ZodOptional<z.ZodString>;
    hasLmn: z.ZodBoolean;
    hasSwo: z.ZodBoolean;
    hasClinicals: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    payerId: string;
    hasLmn: boolean;
    hasSwo: boolean;
    hasClinicals: boolean;
    caseId?: string | undefined;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    physicianName?: string | undefined;
    facilityName?: string | undefined;
}, {
    payerId: string;
    hasLmn: boolean;
    hasSwo: boolean;
    hasClinicals: boolean;
    caseId?: string | undefined;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    physicianName?: string | undefined;
    facilityName?: string | undefined;
}>;
/**
 * HTTP body for `POST /score`: same as {@link scoreCaseSchema} but doc flags may be omitted
 * (filled from `packetId` or defaulted false). Includes legacy / helper fields.
 */
export declare const scorePriorAuthBodySchema: z.ZodObject<{
    caseId: z.ZodOptional<z.ZodString>;
    payerId: z.ZodString;
    planName: z.ZodOptional<z.ZodString>;
    deviceCategory: z.ZodOptional<z.ZodString>;
    hcpcsCode: z.ZodOptional<z.ZodString>;
    diagnosisCode: z.ZodOptional<z.ZodString>;
    physicianName: z.ZodOptional<z.ZodString>;
    facilityName: z.ZodOptional<z.ZodString>;
    hasLmn: z.ZodOptional<z.ZodBoolean>;
    hasSwo: z.ZodOptional<z.ZodBoolean>;
    hasClinicals: z.ZodOptional<z.ZodBoolean>;
} & {
    packetId: z.ZodOptional<z.ZodString>;
    /** @deprecated prefer `hcpcsCode` */
    hcpcs: z.ZodOptional<z.ZodString>;
    diagnosisCodes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    payerId: string;
    caseId?: string | undefined;
    packetId?: string | undefined;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    physicianName?: string | undefined;
    facilityName?: string | undefined;
    hasLmn?: boolean | undefined;
    hasSwo?: boolean | undefined;
    hasClinicals?: boolean | undefined;
    hcpcs?: string | undefined;
    diagnosisCodes?: string[] | undefined;
}, {
    payerId: string;
    caseId?: string | undefined;
    packetId?: string | undefined;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    physicianName?: string | undefined;
    facilityName?: string | undefined;
    hasLmn?: boolean | undefined;
    hasSwo?: boolean | undefined;
    hasClinicals?: boolean | undefined;
    hcpcs?: string | undefined;
    diagnosisCodes?: string[] | undefined;
}>;
export declare const ingestOutcomeSchema: z.ZodObject<{
    caseId: z.ZodOptional<z.ZodString>;
    payerId: z.ZodString;
    planName: z.ZodOptional<z.ZodString>;
    deviceCategory: z.ZodOptional<z.ZodString>;
    hcpcsCode: z.ZodOptional<z.ZodString>;
    diagnosisCode: z.ZodOptional<z.ZodString>;
    physicianName: z.ZodOptional<z.ZodString>;
    facilityName: z.ZodOptional<z.ZodString>;
    outcome: z.ZodEnum<["APPROVED", "DENIED", "PENDED"]>;
    denialReason: z.ZodOptional<z.ZodString>;
    submittedAt: z.ZodOptional<z.ZodString>;
    resolvedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    payerId: string;
    outcome: "APPROVED" | "DENIED" | "PENDED";
    caseId?: string | undefined;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    physicianName?: string | undefined;
    facilityName?: string | undefined;
    denialReason?: string | undefined;
    submittedAt?: string | undefined;
    resolvedAt?: string | undefined;
}, {
    payerId: string;
    outcome: "APPROVED" | "DENIED" | "PENDED";
    caseId?: string | undefined;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    physicianName?: string | undefined;
    facilityName?: string | undefined;
    denialReason?: string | undefined;
    submittedAt?: string | undefined;
    resolvedAt?: string | undefined;
}>;
/**
 * Persisted outcome ingest: extends {@link ingestOutcomeSchema} with multi-code input,
 * optional turnaround override, and legacy `hcpcs` alias.
 */
export declare const ingestOutcomeBodySchema: z.ZodObject<{
    caseId: z.ZodOptional<z.ZodString>;
    payerId: z.ZodString;
    planName: z.ZodOptional<z.ZodString>;
    deviceCategory: z.ZodOptional<z.ZodString>;
    hcpcsCode: z.ZodOptional<z.ZodString>;
    diagnosisCode: z.ZodOptional<z.ZodString>;
    physicianName: z.ZodOptional<z.ZodString>;
    facilityName: z.ZodOptional<z.ZodString>;
    outcome: z.ZodEnum<["APPROVED", "DENIED", "PENDED"]>;
    denialReason: z.ZodOptional<z.ZodString>;
    submittedAt: z.ZodOptional<z.ZodString>;
    resolvedAt: z.ZodOptional<z.ZodString>;
} & {
    diagnosisCodes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    turnaroundDays: z.ZodOptional<z.ZodNumber>;
    /** @deprecated prefer `hcpcsCode` */
    hcpcs: z.ZodOptional<z.ZodString>;
    /** Governance / learning correlation (optional; else resolved from latest case playbook execution). */
    playbookExecutionId: z.ZodOptional<z.ZodString>;
    playbookId: z.ZodOptional<z.ZodString>;
    playbookVersion: z.ZodOptional<z.ZodNumber>;
    /** Snapshot of payer rule ids / versions in effect at submission. */
    payerRuleSnapshot: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, "strip", z.ZodTypeAny, {
    payerId: string;
    outcome: "APPROVED" | "DENIED" | "PENDED";
    caseId?: string | undefined;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    physicianName?: string | undefined;
    facilityName?: string | undefined;
    denialReason?: string | undefined;
    turnaroundDays?: number | undefined;
    submittedAt?: string | undefined;
    resolvedAt?: string | undefined;
    playbookExecutionId?: string | undefined;
    playbookId?: string | undefined;
    playbookVersion?: number | undefined;
    payerRuleSnapshot?: Record<string, any> | undefined;
    hcpcs?: string | undefined;
    diagnosisCodes?: string[] | undefined;
}, {
    payerId: string;
    outcome: "APPROVED" | "DENIED" | "PENDED";
    caseId?: string | undefined;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    physicianName?: string | undefined;
    facilityName?: string | undefined;
    denialReason?: string | undefined;
    turnaroundDays?: number | undefined;
    submittedAt?: string | undefined;
    resolvedAt?: string | undefined;
    playbookExecutionId?: string | undefined;
    playbookId?: string | undefined;
    playbookVersion?: number | undefined;
    payerRuleSnapshot?: Record<string, any> | undefined;
    hcpcs?: string | undefined;
    diagnosisCodes?: string[] | undefined;
}>;
export declare const createPayerRuleSchema: z.ZodObject<{
    payerId: z.ZodString;
    planName: z.ZodOptional<z.ZodString>;
    deviceCategory: z.ZodOptional<z.ZodString>;
    hcpcsCode: z.ZodOptional<z.ZodString>;
    diagnosisCode: z.ZodOptional<z.ZodString>;
    requiresLmn: z.ZodDefault<z.ZodBoolean>;
    requiresSwo: z.ZodDefault<z.ZodBoolean>;
    requiresClinicals: z.ZodDefault<z.ZodBoolean>;
    requiresAuth: z.ZodDefault<z.ZodBoolean>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    payerId: string;
    requiresLmn: boolean;
    requiresSwo: boolean;
    requiresClinicals: boolean;
    requiresAuth: boolean;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    notes?: string | undefined;
}, {
    payerId: string;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    requiresLmn?: boolean | undefined;
    requiresSwo?: boolean | undefined;
    requiresClinicals?: boolean | undefined;
    requiresAuth?: boolean | undefined;
    notes?: string | undefined;
}>;
export declare const createPayerRuleBodySchema: z.ZodObject<{
    payerId: z.ZodString;
    planName: z.ZodOptional<z.ZodString>;
    deviceCategory: z.ZodOptional<z.ZodString>;
    hcpcsCode: z.ZodOptional<z.ZodString>;
    diagnosisCode: z.ZodOptional<z.ZodString>;
    requiresLmn: z.ZodDefault<z.ZodBoolean>;
    requiresSwo: z.ZodDefault<z.ZodBoolean>;
    requiresClinicals: z.ZodDefault<z.ZodBoolean>;
    requiresAuth: z.ZodDefault<z.ZodBoolean>;
    notes: z.ZodOptional<z.ZodString>;
} & {
    active: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    payerId: string;
    requiresLmn: boolean;
    requiresSwo: boolean;
    requiresClinicals: boolean;
    requiresAuth: boolean;
    active?: boolean | undefined;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    notes?: string | undefined;
}, {
    payerId: string;
    active?: boolean | undefined;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    requiresLmn?: boolean | undefined;
    requiresSwo?: boolean | undefined;
    requiresClinicals?: boolean | undefined;
    requiresAuth?: boolean | undefined;
    notes?: string | undefined;
}>;
export type ScoreCaseParsed = z.infer<typeof scoreCaseSchema>;
export type ScorePriorAuthBody = z.infer<typeof scorePriorAuthBodySchema>;
export type IngestOutcomeParsed = z.infer<typeof ingestOutcomeSchema>;
export type IngestOutcomeBody = z.infer<typeof ingestOutcomeBodySchema>;
export type CreatePayerRuleParsed = z.infer<typeof createPayerRuleSchema>;
export type CreatePayerRuleBody = z.infer<typeof createPayerRuleBodySchema>;
//# sourceMappingURL=payerBehavior.schemas.d.ts.map