"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitPacketPriorAuthBodySchema = exports.generatePacketBodySchema = exports.createPacketBodySchema = exports.clinicalInputSchema = exports.generateAndSubmitPriorAuthBodySchema = exports.documentGeneratorInputSchema = void 0;
const zod_1 = require("zod");
exports.documentGeneratorInputSchema = zod_1.z.object({
    patient: zod_1.z.object({
        firstName: zod_1.z.string().min(1),
        lastName: zod_1.z.string().min(1),
        dob: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be YYYY-MM-DD"),
    }),
    diagnosis: zod_1.z.string().optional(),
    device: zod_1.z.string().min(1),
    justification: zod_1.z.string().optional(),
    limitations: zod_1.z.string().optional(),
    failedTreatments: zod_1.z.string().optional(),
    physician: zod_1.z.object({
        name: zod_1.z.string().min(1),
        npi: zod_1.z.string().optional(),
    }),
    hcpcs: zod_1.z.string().optional(),
    orderDate: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "orderDate must be YYYY-MM-DD")
        .optional(),
});
exports.generateAndSubmitPriorAuthBodySchema = zod_1.z.object({
    caseId: zod_1.z.string().min(1),
    input: exports.documentGeneratorInputSchema,
});
exports.clinicalInputSchema = zod_1.z.object({
    diagnosis: zod_1.z
        .array(zod_1.z.object({
        code: zod_1.z.string().min(1),
        description: zod_1.z.string().optional(),
    }))
        .min(1),
    device: zod_1.z.object({
        category: zod_1.z.string().min(1),
        hcpcs: zod_1.z.string().optional(),
        manufacturer: zod_1.z.string().optional(),
        model: zod_1.z.string().optional(),
        quantity: zod_1.z.number().int().positive().optional(),
    }),
    physician: zod_1.z.object({
        name: zod_1.z.string().min(1),
        npi: zod_1.z.string().optional(),
        practice: zod_1.z.string().optional(),
    }),
    clinicalSummaryLines: zod_1.z.array(zod_1.z.string()).optional(),
    clinicalJustification: zod_1.z.string().optional(),
    limitations: zod_1.z.string().optional(),
    failedTreatments: zod_1.z.string().optional(),
    orderDate: zod_1.z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "orderDate must be YYYY-MM-DD")
        .optional(),
    additionalNotes: zod_1.z.string().optional(),
    attachmentMetadata: zod_1.z
        .array(zod_1.z.object({
        id: zod_1.z.string().min(1),
        label: zod_1.z.string().min(1),
        mimeType: zod_1.z.string().optional(),
    }))
        .optional(),
    payerRuleProfileId: zod_1.z.string().optional(),
});
exports.createPacketBodySchema = zod_1.z.object({
    caseId: zod_1.z.string().min(1),
    deviceType: zod_1.z.string().optional(),
    clinical: exports.clinicalInputSchema,
});
exports.generatePacketBodySchema = zod_1.z.object({
    clinical: exports.clinicalInputSchema,
});
exports.submitPacketPriorAuthBodySchema = zod_1.z.object({
    payload: zod_1.z.record(zod_1.z.any()),
});
//# sourceMappingURL=packet.js.map