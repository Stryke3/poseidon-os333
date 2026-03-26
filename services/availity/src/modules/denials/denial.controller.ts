import type { Request, Response, NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";
import { denialIntakeBodySchema, classifyDenialBodySchema, generateAppealBodySchema, submitRecoveryBodySchema, denialOutcomeBodySchema, denialQueueQuerySchema } from "./denial.schemas.js";
import type { DenialEventPayload, DenialIntakeInput, DenialClassificationResult } from "./denial.types.js";
import { classifyDenial } from "./denial.classifier.js";
import { generateAppealDraft } from "./appeal.generator.service.js";
import { denialRecoveryService } from "./denial.recovery.service.js";
import { parseDocumentRefs } from "../packet/packet-hydrate.js";
import { writePayerIntelligenceAudit } from "../../lib/payer-intelligence-audit.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";

function actorFromReq(req: Request): string {
  return (req as Request & { userId?: string }).userId ?? "system";
}

function denialEventToPayload(row: any): DenialEventPayload {
  return {
    id: String(row.id),
    caseId: row.caseId ?? null,
    payerId: String(row.payerId),
    denialCode: row.denialCode ?? null,
    denialReasonText: String(row.denialReasonText),
    denialCategory: row.denialCategory ?? null,
    packetId: row.packetId ?? null,
    playbookId: row.playbookId ?? null,
    playbookVersion: row.playbookVersion ?? null,
    scoreSnapshotId: row.scoreSnapshotId ?? null,
  };
}

async function loadPacketDocsForDenial(prisma: PrismaClient, packetId: string | null | undefined) {
  if (!packetId) return [];
  const packet = await prisma.priorAuthPacket.findUnique({ where: { id: packetId } });
  if (!packet) return [];

  const docIds = parseDocumentRefs(packet.documents);
  if (docIds.length === 0) return [];

  const docs = await prisma.priorAuthDocument.findMany({
    where: { id: { in: docIds } },
  });

  return docs.map((d) => ({ type: String(d.type), content: String(d.content) }));
}

export function createDenialController(prisma: PrismaClient) {
  async function intake(req: Request, res: Response, next: NextFunction) {
    try {
      const input = denialIntakeBodySchema.parse(req.body) as DenialIntakeInput;
      const actor = actorFromReq(req);

      const denialEvent = await prisma.denialEvent.create({
        data: {
          caseId: input.caseId ?? null,
          payerId: input.payerId,
          planName: input.planName ?? null,
          authId: input.authId ?? null,
          denialCode: input.denialCode ?? null,
          denialReasonText: input.denialReasonText,
          denialCategory: null,
          packetId: input.packetId ?? null,
          playbookId: input.playbookId ?? null,
          playbookVersion: input.playbookVersion ?? null,
          scoreSnapshotId: input.scoreSnapshotId ?? null,
        },
      });

      await writePayerIntelligenceAudit(prisma, {
        action: "denial_intake",
        payerId: input.payerId,
        caseId: input.caseId ?? null,
        snapshotId: null,
        outcomeId: null,
        detail: { denialEventId: denialEvent.id, denialCode: input.denialCode ?? null },
        actor,
      });

      res.status(201).json({ success: true, denialEvent });
    } catch (err: unknown) {
      next(err);
    }
  }

  async function classify(req: Request, res: Response, next: NextFunction) {
    try {
      const body = classifyDenialBodySchema.parse(req.body);
      const actor = actorFromReq(req);

      const event = await prisma.denialEvent.findUnique({ where: { id: body.denialEventId } });
      if (!event) {
        res.status(404).json({ error: "denialEventId not found" });
        return;
      }

      const payload = denialEventToPayload(event);
      const classification = classifyDenial({
        denialCode: payload.denialCode ?? undefined,
        denialReasonText: payload.denialReasonText,
      });

      const snapshot = await prisma.denialClassificationSnapshot.create({
        data: {
          denialEventId: event.id,
          category: classification.category,
          confidence: classification.confidence,
          recoveryType: classification.recoveryType,
          requiredFixes: classification.requiredFixes as any,
          requiredAttachments: classification.requiredAttachments as any,
          escalationSteps: classification.escalationSteps as any,
          explanation: classification.explanation as any,
        },
      });

      await writePayerIntelligenceAudit(prisma, {
        action: "denial_classified",
        payerId: payload.payerId,
        caseId: payload.caseId,
        snapshotId: null,
        outcomeId: null,
        detail: { denialEventId: event.id, category: classification.category, snapshotId: snapshot.id },
        actor,
      });

      res.json({ success: true, classification, snapshot });
    } catch (err: unknown) {
      next(err);
    }
  }

  async function generateAppeal(req: Request, res: Response, next: NextFunction) {
    try {
      const body = generateAppealBodySchema.parse(req.body);
      const actor = actorFromReq(req);

      const event = await prisma.denialEvent.findUnique({ where: { id: body.denialEventId } });
      if (!event) {
        res.status(404).json({ error: "denialEventId not found" });
        return;
      }

      const classifications = await prisma.denialClassificationSnapshot.findMany({
        where: { denialEventId: event.id },
        orderBy: { createdAt: "desc" },
      });
      const latest = classifications[0];

      let classification: DenialClassificationResult;
      if (latest) {
        classification = {
          category: latest.category as any,
          confidence: latest.confidence ?? 0.6,
          recoveryType: latest.recoveryType as any,
          requiredFixes: Array.isArray(latest.requiredFixes) ? (latest.requiredFixes as any) : [],
          requiredAttachments: Array.isArray(latest.requiredAttachments) ? (latest.requiredAttachments as any) : [],
          escalationSteps: Array.isArray(latest.escalationSteps) ? (latest.escalationSteps as any) : [],
          explanation: Array.isArray(latest.explanation) ? (latest.explanation as any) : [],
        };
      } else {
        // Deterministic fallback: classify now.
        const payload = denialEventToPayload(event);
        classification = classifyDenial({
          denialCode: payload.denialCode ?? undefined,
          denialReasonText: payload.denialReasonText,
        });
      }

      const packetDocs = await loadPacketDocsForDenial(prisma, event.packetId);
      const denialPayload = denialEventToPayload(event);

      const draft = generateAppealDraft({
        denial: denialPayload,
        classification,
        packetDocs,
      });

      const appealPacket = await prisma.appealPacket.create({
        data: {
          denialEventId: event.id,
          caseId: event.caseId ?? null,
          recoveryType: classification.recoveryType,
          letterText: draft.letterText,
          rebuttalPoints: draft.rebuttalPoints as any,
          attachmentChecklist: draft.attachmentChecklist as any,
          payload: draft.payload as any,
          status: "DRAFT",
        },
      });

      await writePayerIntelligenceAudit(prisma, {
        action: "denial_appeal_generated",
        payerId: event.payerId,
        caseId: event.caseId,
        snapshotId: null,
        outcomeId: null,
        detail: { denialEventId: event.id, appealPacketId: appealPacket.id },
        actor,
      });

      logger.info({ denialAppealGenerated: true, denialEventId: event.id, appealPacketId: appealPacket.id }, "denial_appeal_generated");

      res.status(201).json({ success: true, appealPacket, classification });
    } catch (err: unknown) {
      next(err);
    }
  }

  async function submitRecovery(req: Request, res: Response, next: NextFunction) {
    try {
      const body = submitRecoveryBodySchema.parse(req.body);
      const actor = actorFromReq(req);

      const appealPacket = await prisma.appealPacket.findUnique({ where: { id: body.appealPacketId } });
      if (!appealPacket) {
        res.status(404).json({ error: "appealPacketId not found" });
        return;
      }

      const denialEvent = await prisma.denialEvent.findUnique({
        where: { id: appealPacket.denialEventId },
      });

      const updated = await prisma.appealPacket.update({
        where: { id: appealPacket.id },
        data: { status: "SUBMITTED" },
      });

      await writePayerIntelligenceAudit(prisma, {
        action: "appeal_packet_submitted",
        payerId: denialEvent?.payerId ?? null,
        caseId: updated.caseId ?? null,
        detail: { appealPacketId: updated.id, denialEventId: updated.denialEventId, status: updated.status },
        actor,
      });

      res.json({ success: true, appealPacket: updated });
    } catch (err: unknown) {
      next(err);
    }
  }

  async function outcome(req: Request, res: Response, next: NextFunction) {
    try {
      const body = denialOutcomeBodySchema.parse(req.body);
      const actor = actorFromReq(req);

      const appealPacket = await prisma.appealPacket.findUnique({ where: { id: body.appealPacketId } });
      if (!appealPacket) {
        res.status(404).json({ error: "appealPacketId not found" });
        return;
      }

      const denialEvent = await prisma.denialEvent.findUnique({
        where: { id: appealPacket.denialEventId },
      });

      const created = await prisma.appealOutcome.create({
        data: {
          appealPacketId: appealPacket.id,
          outcome: body.outcome,
          resolvedAt: body.resolvedAt ? new Date(body.resolvedAt) : null,
          notes: body.notes ?? null,
        },
      });

      await writePayerIntelligenceAudit(prisma, {
        action: "appeal_outcome_recorded",
        payerId: denialEvent?.payerId ?? null,
        caseId: appealPacket.caseId ?? null,
        detail: { appealPacketId: appealPacket.id, outcome: body.outcome, appealOutcomeId: created.id },
        actor,
      });

      res.status(201).json({ success: true, outcome: created });
    } catch (err: unknown) {
      next(err);
    }
  }

  async function queue(req: Request, res: Response, next: NextFunction) {
    try {
      const query = denialQueueQuerySchema.parse(req.query ?? {});
      const payerId = query.payerId ?? undefined;

      const needsClassification = query.status === "NEEDS_CLASSIFICATION";
      const readyToAppeal = query.status === "READY_TO_APPEAL";

      // Minimal queue: list denial events ordered by newest.
      const events = await prisma.denialEvent.findMany({
        where: payerId ? { payerId } : {},
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      const enriched = [];
      for (const e of events) {
        const latestClass = await prisma.denialClassificationSnapshot.findFirst({
          where: { denialEventId: e.id },
          orderBy: { createdAt: "desc" },
        });
        const latestAppeal = await prisma.appealPacket.findFirst({
          where: { denialEventId: e.id },
          orderBy: { createdAt: "desc" },
        });

        if (needsClassification && latestClass) continue;
        if (readyToAppeal && (!latestClass || latestAppeal)) continue;

        enriched.push({
          denialEvent: e,
          latestClassification: latestClass,
          latestAppealPacket: latestAppeal,
        });
      }

      res.json({ success: true, queue: enriched });
    } catch (err: unknown) {
      next(err);
    }
  }

  async function getDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const denialEventId = req.params.denialEventId;
      const event = await prisma.denialEvent.findUnique({ where: { id: denialEventId } });
      if (!event) {
        res.status(404).json({ error: "denialEventId not found" });
        return;
      }
      const classification = await prisma.denialClassificationSnapshot.findFirst({
        where: { denialEventId: event.id },
        orderBy: { createdAt: "desc" },
      });
      const appeal = await prisma.appealPacket.findFirst({
        where: { denialEventId: event.id },
        orderBy: { createdAt: "desc" },
      });

      res.json({ success: true, denialEvent: event, classification, appeal });
    } catch (err: unknown) {
      next(err);
    }
  }

  return { intake, classify, generateAppeal, submitRecovery, outcome, queue, getDetails };
}

// Named exports for router wiring (and to match your preferred style).
const defaultHandlers = createDenialController(prisma);

export async function intakeDenial(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await denialRecoveryService.intake(req.body);
    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
}

export async function classifyDenialEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { denialEventId } = req.body as { denialEventId?: string };
    if (!denialEventId || typeof denialEventId !== "string" || !denialEventId.trim()) {
      res.status(400).json({ error: "denialEventId is required" });
      return;
    }
    const result = await denialRecoveryService.classifyAndSnapshot(denialEventId.trim());
    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
}

export async function generateAppealPacket(req: Request, res: Response, next: NextFunction) {
  try {
    const { denialEventId } = req.body as { denialEventId?: string };
    if (!denialEventId || typeof denialEventId !== "string" || !denialEventId.trim()) {
      res.status(400).json({ error: "denialEventId is required" });
      return;
    }
    const result = await denialRecoveryService.generateRecoveryPacket(req.body);
    res.json({ success: true, result });
  } catch (error) {
    next(error);
  }
}

export const submitRecoveryPacket = defaultHandlers.submitRecovery;
export const recordDenialOutcome = defaultHandlers.outcome;
export const denialQueue = defaultHandlers.queue;
export const denialDetails = defaultHandlers.getDetails;

