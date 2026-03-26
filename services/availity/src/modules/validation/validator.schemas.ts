import { z } from "zod";

export const preSubmitValidationBodySchema = z
  .object({
    packetId: z.string().min(1).optional(),
    actor: z.string().min(1).optional(),
  })
  .passthrough();

