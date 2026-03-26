"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preSubmitValidationBodySchema = void 0;
const zod_1 = require("zod");
exports.preSubmitValidationBodySchema = zod_1.z
    .object({
    packetId: zod_1.z.string().min(1).optional(),
    actor: zod_1.z.string().min(1).optional(),
})
    .passthrough();
//# sourceMappingURL=validator.schemas.js.map