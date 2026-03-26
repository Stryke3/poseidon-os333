"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priorAuthStatusParamsSchema = exports.priorAuthRequestSchema = exports.eligibilityRequestSchema = void 0;
exports.toAvailityEligibilityRequest = toAvailityEligibilityRequest;
const zod_1 = require("zod");
exports.eligibilityRequestSchema = zod_1.z.object({
    caseId: zod_1.z.string().optional(),
    payerId: zod_1.z.string().min(1),
    memberId: zod_1.z.string().min(1),
    patient: zod_1.z.object({
        firstName: zod_1.z.string().min(1),
        lastName: zod_1.z.string().min(1),
        dob: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dob must be YYYY-MM-DD"),
    }),
    provider: zod_1.z
        .object({
        npi: zod_1.z.string().optional(),
    })
        .optional(),
});
exports.priorAuthRequestSchema = zod_1.z.object({
    caseId: zod_1.z.string().optional(),
    packetId: zod_1.z.string().optional(),
    payload: zod_1.z.record(zod_1.z.any()),
});
/** Map validated HTTP body to the canonical Availity domain shape. */
function toAvailityEligibilityRequest(body) {
    return {
        payerId: body.payerId,
        memberId: body.memberId,
        patient: body.patient,
        provider: body.provider,
        caseId: body.caseId,
    };
}
exports.priorAuthStatusParamsSchema = zod_1.z.object({
    authId: zod_1.z.string().min(1),
});
//# sourceMappingURL=eligibility.js.map