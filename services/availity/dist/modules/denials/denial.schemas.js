"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.denialQueueQuerySchema = exports.denialOutcomeBodySchema = exports.submitRecoveryBodySchema = exports.generateAppealBodySchema = exports.classifyDenialBodySchema = exports.denialIntakeBodySchema = exports.denialIntakeSchema = void 0;
const zod_1 = require("zod");
exports.denialIntakeSchema = zod_1.z.object({
    caseId: zod_1.z.string().optional(),
    payerId: zod_1.z.string().min(1),
    planName: zod_1.z.string().optional(),
    authId: zod_1.z.string().optional(),
    denialCode: zod_1.z.string().optional(),
    denialReasonText: zod_1.z.string().min(1),
    packetId: zod_1.z.string().optional(),
    playbookId: zod_1.z.string().optional(),
    playbookVersion: zod_1.z.number().int().nonnegative().optional(),
    scoreSnapshotId: zod_1.z.string().optional(),
});
exports.denialIntakeBodySchema = exports.denialIntakeSchema;
exports.classifyDenialBodySchema = zod_1.z.object({
    denialEventId: zod_1.z.string().min(1),
});
exports.generateAppealBodySchema = zod_1.z.object({
    denialEventId: zod_1.z.string().min(1),
});
exports.submitRecoveryBodySchema = zod_1.z.object({
    appealPacketId: zod_1.z.string().min(1),
});
exports.denialOutcomeBodySchema = zod_1.z.object({
    appealPacketId: zod_1.z.string().min(1),
    outcome: zod_1.z.enum(["OVERTURNED", "UPHELD", "PENDING"]),
    resolvedAt: zod_1.z.string().datetime().optional(),
    notes: zod_1.z.string().optional(),
});
exports.denialQueueQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(["ALL", "NEEDS_CLASSIFICATION", "READY_TO_APPEAL"]).optional(),
    payerId: zod_1.z.string().optional(),
});
//# sourceMappingURL=denial.schemas.js.map