import type { Request, Response, NextFunction } from "express";
import {
  createPayerRuleSchema,
  ingestOutcomeSchema,
  scorePriorAuthBodySchema,
} from "./payerBehavior.schemas.js";
import { payerBehaviorService } from "./payerBehavior.service.js";

function actorFromReq(req: Request): string {
  return (req as Request & { userId?: string }).userId ?? "user";
}

/**
 * POST /score — accepts {@link scorePriorAuthBodySchema}: strict case fields plus optional
 * `packetId` / `diagnosisCodes` / legacy `hcpcs`; merges packet doc types when `packetId` is set.
 */
export async function scorePayerCase(req: Request, res: Response, next: NextFunction) {
  try {
    const body = scorePriorAuthBodySchema.parse(req.body);
    const { snapshot, score } = await payerBehaviorService.scorePriorAuth(
      body,
      actorFromReq(req),
    );
    res.json({ success: true, snapshotId: snapshot.id, ...score });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "CASE_NOT_FOUND") {
      res.status(404).json({ error: "Case not found" });
      return;
    }
    next(err);
  }
}

export async function ingestPayerOutcome(req: Request, res: Response, next: NextFunction) {
  try {
    const input = ingestOutcomeSchema.parse(req.body);
    const result = await payerBehaviorService.ingestOutcome(input, actorFromReq(req));
    res.status(201).json({ success: true, result, outcome: result });
  } catch (error) {
    next(error);
  }
}

export async function createPayerRule(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createPayerRuleSchema.parse(req.body);
    const rule = await payerBehaviorService.createRule(input, actorFromReq(req));
    res.status(201).json({ success: true, rule });
  } catch (error) {
    next(error);
  }
}

export async function getPayerRules(req: Request, res: Response, next: NextFunction) {
  try {
    const payerId = req.params.payerId;
    if (!payerId) {
      res.status(400).json({ error: "payerId required" });
      return;
    }
    const rules = await payerBehaviorService.listRules(payerId);
    res.json({ success: true, rules });
  } catch (error) {
    next(error);
  }
}
