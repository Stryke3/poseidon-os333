"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPayerRuleBodySchema = exports.createPayerRuleSchema = exports.ingestOutcomeBodySchema = exports.ingestOutcomeSchema = exports.scorePriorAuthBodySchema = exports.scoreCaseSchema = void 0;
const zod_1 = require("zod");
/** Strict case payload for scoring (e.g. after normalization). */
exports.scoreCaseSchema = zod_1.z.object({
    caseId: zod_1.z.string().optional(),
    payerId: zod_1.z.string().min(1),
    planName: zod_1.z.string().optional(),
    deviceCategory: zod_1.z.string().optional(),
    hcpcsCode: zod_1.z.string().optional(),
    diagnosisCode: zod_1.z.string().optional(),
    physicianName: zod_1.z.string().optional(),
    facilityName: zod_1.z.string().optional(),
    hasLmn: zod_1.z.boolean(),
    hasSwo: zod_1.z.boolean(),
    hasClinicals: zod_1.z.boolean(),
});
/**
 * HTTP body for `POST /score`: same as {@link scoreCaseSchema} but doc flags may be omitted
 * (filled from `packetId` or defaulted false). Includes legacy / helper fields.
 */
exports.scorePriorAuthBodySchema = exports.scoreCaseSchema
    .partial({ hasLmn: true, hasSwo: true, hasClinicals: true })
    .extend({
    packetId: zod_1.z.string().optional(),
    /** @deprecated prefer `hcpcsCode` */
    hcpcs: zod_1.z.string().optional(),
    diagnosisCodes: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.ingestOutcomeSchema = zod_1.z.object({
    caseId: zod_1.z.string().optional(),
    payerId: zod_1.z.string().min(1),
    planName: zod_1.z.string().optional(),
    deviceCategory: zod_1.z.string().optional(),
    hcpcsCode: zod_1.z.string().optional(),
    diagnosisCode: zod_1.z.string().optional(),
    physicianName: zod_1.z.string().optional(),
    facilityName: zod_1.z.string().optional(),
    outcome: zod_1.z.enum(["APPROVED", "DENIED", "PENDED"]),
    denialReason: zod_1.z.string().optional(),
    submittedAt: zod_1.z.string().optional(),
    resolvedAt: zod_1.z.string().optional(),
});
/**
 * Persisted outcome ingest: extends {@link ingestOutcomeSchema} with multi-code input,
 * optional turnaround override, and legacy `hcpcs` alias.
 */
exports.ingestOutcomeBodySchema = exports.ingestOutcomeSchema.extend({
    diagnosisCodes: zod_1.z.array(zod_1.z.string()).optional(),
    turnaroundDays: zod_1.z.number().int().nonnegative().optional(),
    /** @deprecated prefer `hcpcsCode` */
    hcpcs: zod_1.z.string().optional(),
    /** Governance / learning correlation (optional; else resolved from latest case playbook execution). */
    playbookExecutionId: zod_1.z.string().optional(),
    playbookId: zod_1.z.string().optional(),
    playbookVersion: zod_1.z.coerce.number().int().optional(),
    /** Snapshot of payer rule ids / versions in effect at submission. */
    payerRuleSnapshot: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
});
exports.createPayerRuleSchema = zod_1.z.object({
    payerId: zod_1.z.string().min(1),
    planName: zod_1.z.string().optional(),
    deviceCategory: zod_1.z.string().optional(),
    hcpcsCode: zod_1.z.string().optional(),
    diagnosisCode: zod_1.z.string().optional(),
    requiresLmn: zod_1.z.boolean().default(false),
    requiresSwo: zod_1.z.boolean().default(false),
    requiresClinicals: zod_1.z.boolean().default(false),
    requiresAuth: zod_1.z.boolean().default(true),
    notes: zod_1.z.string().optional(),
});
exports.createPayerRuleBodySchema = exports.createPayerRuleSchema.extend({
    active: zod_1.z.boolean().optional(),
});
//# sourceMappingURL=payerBehavior.schemas.js.map