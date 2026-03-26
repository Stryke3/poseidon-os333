"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchPlaybooksQuerySchema = exports.executePlaybookBodySchema = exports.createPlaybookBodySchema = exports.playbookEscalationRulesJsonSchema = exports.playbookDocumentRulesJsonSchema = exports.playbookStrategyJsonSchema = void 0;
const zod_1 = require("zod");
exports.playbookStrategyJsonSchema = zod_1.z
    .object({
    requiredDocuments: zod_1.z.array(zod_1.z.string()).optional(),
    timing: zod_1.z.enum(["IMMEDIATE", "DELAY", "REVIEW"]).optional(),
})
    .default({});
exports.playbookDocumentRulesJsonSchema = zod_1.z
    .object({
    lmnAdditions: zod_1.z.array(zod_1.z.string()).optional(),
    clinicalAdditions: zod_1.z.array(zod_1.z.string()).optional(),
})
    .default({});
exports.playbookEscalationRulesJsonSchema = zod_1.z
    .object({
    onDenial: zod_1.z.array(zod_1.z.string()).optional(),
    peerToPeer: zod_1.z.boolean().optional(),
})
    .default({});
exports.createPlaybookBodySchema = zod_1.z.object({
    payerId: zod_1.z.string().min(1),
    planName: zod_1.z.string().optional(),
    deviceCategory: zod_1.z.string().optional(),
    hcpcsCode: zod_1.z.string().optional(),
    diagnosisCode: zod_1.z.string().optional(),
    strategy: zod_1.z.unknown().optional(),
    documentRules: zod_1.z.unknown().optional(),
    escalationRules: zod_1.z.unknown().optional(),
    version: zod_1.z.number().int().positive().optional(),
    active: zod_1.z.boolean().optional(),
});
exports.executePlaybookBodySchema = zod_1.z.object({
    playbookId: zod_1.z.string().optional(),
    packetId: zod_1.z.string().min(1),
    runPayerScore: zod_1.z.boolean().optional(),
});
exports.matchPlaybooksQuerySchema = zod_1.z.object({
    payerId: zod_1.z.string().min(1),
    planName: zod_1.z.string().optional(),
    deviceCategory: zod_1.z.string().optional(),
    hcpcsCode: zod_1.z.string().optional(),
    diagnosisCodes: zod_1.z.string().optional(),
});
//# sourceMappingURL=playbook.schemas.js.map