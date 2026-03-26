import { z } from "zod";
export declare const preSubmitValidationBodySchema: z.ZodObject<{
    packetId: z.ZodOptional<z.ZodString>;
    actor: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    packetId: z.ZodOptional<z.ZodString>;
    actor: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    packetId: z.ZodOptional<z.ZodString>;
    actor: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
//# sourceMappingURL=validator.schemas.d.ts.map