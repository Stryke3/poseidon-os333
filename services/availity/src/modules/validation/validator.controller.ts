import type { Request, Response, NextFunction } from "express";
import { preSubmitValidationBodySchema } from "./validator.schemas.js";
import { validatePacketPreSubmit } from "./validator.service.js";
import type { PrismaClient } from "@prisma/client";
import type { ValidationInput } from "./validator.types.js";

function actorFromReq(req: Request): string {
  return (req as Request & { userId?: string }).userId ?? "system";
}

export function createValidatorController(prisma: PrismaClient) {
  async function validatePreSubmit(req: Request, res: Response, next: NextFunction) {
    try {
      const body = preSubmitValidationBodySchema.parse(req.body ?? {}) as Record<string, unknown>;
      const actor = (typeof body.actor === "string" ? body.actor : undefined) ?? actorFromReq(req);

      // Backwards-compatible: accept either { packetId } (load from DB) or a full ValidationInput.
      if (typeof body.packetId === "string" && body.packetId.trim()) {
        const result = await validatePacketPreSubmit(prisma, {
          packetId: body.packetId.trim(),
          actor,
        });
        res.json(result);
        return;
      }

      const input = body as unknown as ValidationInput;
      if (!input?.payerId || typeof input.payerId !== "string" || !input.payerId.trim()) {
        res.status(400).json({ error: "payerId is required (or provide packetId)" });
        return;
      }

      // Validate directly from supplied payload; persist to ValidationResult for audit.
      const manualRequirements = await prisma.manualRequirement.findMany({
        where: { payerId: input.payerId.trim(), active: true },
      });
      const payerRules = await prisma.payerRule.findMany({
        where: { payerId: input.payerId.trim(), active: true },
      });
      const { validateRequirements } = await import("./validator.rules.js");
      const result = validateRequirements(input, manualRequirements, payerRules, null);

      const record = await prisma.validationResult.create({
        data: {
          caseId: input.caseId ?? null,
          payerId: input.payerId.trim(),
          status: result.status,
          missingRequirements: JSON.parse(JSON.stringify(result.missingRequirements)),
          violations: JSON.parse(JSON.stringify(result.violations)),
          warnings: JSON.parse(JSON.stringify(result.warnings)),
          recommendedActions: JSON.parse(JSON.stringify(result.recommendedActions)),
          explanation: JSON.parse(JSON.stringify(result.explanation)),
        },
      });

      res.json({ id: record.id, ...result });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message === "PACKET_NOT_FOUND") {
          res.status(404).json({ error: "Packet not found" });
          return;
        }
        if (err.message === "CASE_NOT_FOUND") {
          res.status(404).json({ error: "Case not found" });
          return;
        }
        if (err.message === "NO_PLAYBOOK_MATCH") {
          res.status(400).json({ error: "No matching playbook found" });
          return;
        }
      }
      next(err);
    }
  }

  // Backwards-compatible alias (older code referenced `preSubmitValidation`).
  const preSubmitValidation = validatePreSubmit;

  return { validatePreSubmit, preSubmitValidation };
}

