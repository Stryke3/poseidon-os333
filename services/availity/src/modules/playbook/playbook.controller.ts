import type { Request, Response, NextFunction } from "express";
import {
  createPlaybookBodySchema,
  executePlaybookBodySchema,
  matchPlaybooksQuerySchema,
} from "./playbook.schemas.js";
import { playbookService } from "./playbook.service.js";
import type { PlaybookMatchContext } from "./playbook.types.js";

function actorFromReq(req: Request): string {
  return (req as Request & { userId?: string }).userId ?? "user";
}

export async function postPlaybook(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createPlaybookBodySchema.parse(req.body);
    const row = await playbookService.createPlaybook(body, actorFromReq(req));
    res.status(201).json({ success: true, playbook: row });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("PLAYBOOK_VERSION_CONFLICT")) {
      res.status(409).json({ error: err.message, code: "PLAYBOOK_VERSION_CONFLICT" });
      return;
    }
    next(err);
  }
}

export async function getPlaybooksByPayer(req: Request, res: Response, next: NextFunction) {
  try {
    const payerId = req.params.payerId;
    if (!payerId) {
      res.status(400).json({ error: "payerId required" });
      return;
    }
    const includeInactive =
      req.query.includeInactive === "1" || req.query.includeInactive === "true";
    const playbooks = await playbookService.listByPayerId(payerId, { includeInactive });
    res.json({ success: true, playbooks });
  } catch (err) {
    next(err);
  }
}

export async function getPlaybookMatch(req: Request, res: Response, next: NextFunction) {
  try {
    const q = matchPlaybooksQuerySchema.parse({
      payerId: req.query.payerId,
      planName: req.query.planName,
      deviceCategory: req.query.deviceCategory,
      hcpcsCode: req.query.hcpcsCode,
      diagnosisCodes: req.query.diagnosisCodes,
    });
    const dx = q.diagnosisCodes
      ? q.diagnosisCodes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const ctx: PlaybookMatchContext = {
      payerId: q.payerId,
      planName: q.planName,
      deviceCategory: q.deviceCategory,
      hcpcsCode: q.hcpcsCode,
      diagnosisCodes: dx,
    };
    const result = await playbookService.matchPlaybooks(ctx);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function postPlaybookExecute(req: Request, res: Response, next: NextFunction) {
  try {
    const body = executePlaybookBodySchema.parse(req.body);
    const result = await playbookService.executeOnPacket({
      packetId: body.packetId,
      playbookId: body.playbookId,
      actor: actorFromReq(req),
      runPayerScore: body.runPayerScore,
    });
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "PACKET_NOT_FOUND") {
      res.status(404).json({ error: "Packet not found" });
      return;
    }
    if (err instanceof Error && err.message === "CASE_NOT_FOUND") {
      res.status(404).json({ error: "Case not found" });
      return;
    }
    if (err instanceof Error && err.message === "PLAYBOOK_NOT_FOUND") {
      res.status(404).json({ error: "Playbook not found for payer" });
      return;
    }
    if (err instanceof Error && err.message === "NO_PLAYBOOK_MATCH") {
      res.status(422).json({
        error: "No active playbook matches this packet context.",
        code: "NO_PLAYBOOK_MATCH",
      });
      return;
    }
    next(err);
  }
}
