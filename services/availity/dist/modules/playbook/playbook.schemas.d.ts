import { z } from "zod";
export declare const playbookStrategyJsonSchema: z.ZodDefault<z.ZodObject<{
    requiredDocuments: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    timing: z.ZodOptional<z.ZodEnum<["IMMEDIATE", "DELAY", "REVIEW"]>>;
}, "strip", z.ZodTypeAny, {
    requiredDocuments?: string[] | undefined;
    timing?: "IMMEDIATE" | "DELAY" | "REVIEW" | undefined;
}, {
    requiredDocuments?: string[] | undefined;
    timing?: "IMMEDIATE" | "DELAY" | "REVIEW" | undefined;
}>>;
export declare const playbookDocumentRulesJsonSchema: z.ZodDefault<z.ZodObject<{
    lmnAdditions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    clinicalAdditions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    lmnAdditions?: string[] | undefined;
    clinicalAdditions?: string[] | undefined;
}, {
    lmnAdditions?: string[] | undefined;
    clinicalAdditions?: string[] | undefined;
}>>;
export declare const playbookEscalationRulesJsonSchema: z.ZodDefault<z.ZodObject<{
    onDenial: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    peerToPeer: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    onDenial?: string[] | undefined;
    peerToPeer?: boolean | undefined;
}, {
    onDenial?: string[] | undefined;
    peerToPeer?: boolean | undefined;
}>>;
export declare const createPlaybookBodySchema: z.ZodObject<{
    payerId: z.ZodString;
    planName: z.ZodOptional<z.ZodString>;
    deviceCategory: z.ZodOptional<z.ZodString>;
    hcpcsCode: z.ZodOptional<z.ZodString>;
    diagnosisCode: z.ZodOptional<z.ZodString>;
    strategy: z.ZodOptional<z.ZodUnknown>;
    documentRules: z.ZodOptional<z.ZodUnknown>;
    escalationRules: z.ZodOptional<z.ZodUnknown>;
    version: z.ZodOptional<z.ZodNumber>;
    active: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    payerId: string;
    active?: boolean | undefined;
    version?: number | undefined;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    strategy?: unknown;
    documentRules?: unknown;
    escalationRules?: unknown;
}, {
    payerId: string;
    active?: boolean | undefined;
    version?: number | undefined;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCode?: string | undefined;
    strategy?: unknown;
    documentRules?: unknown;
    escalationRules?: unknown;
}>;
export declare const executePlaybookBodySchema: z.ZodObject<{
    playbookId: z.ZodOptional<z.ZodString>;
    packetId: z.ZodString;
    runPayerScore: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    packetId: string;
    playbookId?: string | undefined;
    runPayerScore?: boolean | undefined;
}, {
    packetId: string;
    playbookId?: string | undefined;
    runPayerScore?: boolean | undefined;
}>;
export declare const matchPlaybooksQuerySchema: z.ZodObject<{
    payerId: z.ZodString;
    planName: z.ZodOptional<z.ZodString>;
    deviceCategory: z.ZodOptional<z.ZodString>;
    hcpcsCode: z.ZodOptional<z.ZodString>;
    diagnosisCodes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    payerId: string;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCodes?: string | undefined;
}, {
    payerId: string;
    planName?: string | undefined;
    deviceCategory?: string | undefined;
    hcpcsCode?: string | undefined;
    diagnosisCodes?: string | undefined;
}>;
export type CreatePlaybookBody = z.infer<typeof createPlaybookBodySchema>;
export type ExecutePlaybookBody = z.infer<typeof executePlaybookBodySchema>;
//# sourceMappingURL=playbook.schemas.d.ts.map