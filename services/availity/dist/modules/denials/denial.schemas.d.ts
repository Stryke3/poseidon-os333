import { z } from "zod";
import type { DenialIntakeInput } from "./denial.types.js";
export declare const denialIntakeSchema: z.ZodObject<{
    caseId: z.ZodOptional<z.ZodString>;
    payerId: z.ZodString;
    planName: z.ZodOptional<z.ZodString>;
    authId: z.ZodOptional<z.ZodString>;
    denialCode: z.ZodOptional<z.ZodString>;
    denialReasonText: z.ZodString;
    packetId: z.ZodOptional<z.ZodString>;
    playbookId: z.ZodOptional<z.ZodString>;
    playbookVersion: z.ZodOptional<z.ZodNumber>;
    scoreSnapshotId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    payerId: string;
    denialReasonText: string;
    caseId?: string | undefined;
    packetId?: string | undefined;
    authId?: string | undefined;
    planName?: string | undefined;
    playbookId?: string | undefined;
    playbookVersion?: number | undefined;
    denialCode?: string | undefined;
    scoreSnapshotId?: string | undefined;
}, {
    payerId: string;
    denialReasonText: string;
    caseId?: string | undefined;
    packetId?: string | undefined;
    authId?: string | undefined;
    planName?: string | undefined;
    playbookId?: string | undefined;
    playbookVersion?: number | undefined;
    denialCode?: string | undefined;
    scoreSnapshotId?: string | undefined;
}>;
export declare const denialIntakeBodySchema: z.ZodObject<{
    caseId: z.ZodOptional<z.ZodString>;
    payerId: z.ZodString;
    planName: z.ZodOptional<z.ZodString>;
    authId: z.ZodOptional<z.ZodString>;
    denialCode: z.ZodOptional<z.ZodString>;
    denialReasonText: z.ZodString;
    packetId: z.ZodOptional<z.ZodString>;
    playbookId: z.ZodOptional<z.ZodString>;
    playbookVersion: z.ZodOptional<z.ZodNumber>;
    scoreSnapshotId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    payerId: string;
    denialReasonText: string;
    caseId?: string | undefined;
    packetId?: string | undefined;
    authId?: string | undefined;
    planName?: string | undefined;
    playbookId?: string | undefined;
    playbookVersion?: number | undefined;
    denialCode?: string | undefined;
    scoreSnapshotId?: string | undefined;
}, {
    payerId: string;
    denialReasonText: string;
    caseId?: string | undefined;
    packetId?: string | undefined;
    authId?: string | undefined;
    planName?: string | undefined;
    playbookId?: string | undefined;
    playbookVersion?: number | undefined;
    denialCode?: string | undefined;
    scoreSnapshotId?: string | undefined;
}>;
export type DenialIntakeBody = z.infer<typeof denialIntakeSchema>;
export type DenialIntakeParsed = DenialIntakeBody & DenialIntakeInput;
export declare const classifyDenialBodySchema: z.ZodObject<{
    denialEventId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    denialEventId: string;
}, {
    denialEventId: string;
}>;
export declare const generateAppealBodySchema: z.ZodObject<{
    denialEventId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    denialEventId: string;
}, {
    denialEventId: string;
}>;
export declare const submitRecoveryBodySchema: z.ZodObject<{
    appealPacketId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    appealPacketId: string;
}, {
    appealPacketId: string;
}>;
export declare const denialOutcomeBodySchema: z.ZodObject<{
    appealPacketId: z.ZodString;
    outcome: z.ZodEnum<["OVERTURNED", "UPHELD", "PENDING"]>;
    resolvedAt: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    outcome: "PENDING" | "OVERTURNED" | "UPHELD";
    appealPacketId: string;
    resolvedAt?: string | undefined;
    notes?: string | undefined;
}, {
    outcome: "PENDING" | "OVERTURNED" | "UPHELD";
    appealPacketId: string;
    resolvedAt?: string | undefined;
    notes?: string | undefined;
}>;
export type DenialOutcomeBody = z.infer<typeof denialOutcomeBodySchema>;
export declare const denialQueueQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["ALL", "NEEDS_CLASSIFICATION", "READY_TO_APPEAL"]>>;
    payerId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    payerId?: string | undefined;
    status?: "ALL" | "NEEDS_CLASSIFICATION" | "READY_TO_APPEAL" | undefined;
}, {
    payerId?: string | undefined;
    status?: "ALL" | "NEEDS_CLASSIFICATION" | "READY_TO_APPEAL" | undefined;
}>;
//# sourceMappingURL=denial.schemas.d.ts.map