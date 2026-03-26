import type { Request, Response, NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";
import {
  createPacketBodySchema,
  generateAndSubmitPriorAuthBodySchema,
  generatePacketBodySchema,
  submitPacketPriorAuthBodySchema,
} from "../../schemas/packet.js";
import {
  createPacketWithInitialGeneration,
  regeneratePacket,
} from "./packet-generator.service.js";
import { availityClient } from "../../client/availity-client.js";
import { PACKET_SCHEMA_VERSION } from "../../types/packet.js";
import type { PacketPayloadStoredJson } from "../../types/packet.js";
import { parseDocumentRefs, hydratePriorAuthPacketView } from "./packet-hydrate.js";
import { logger } from "../../lib/logger.js";
import { priorAuthPacketService } from "./prior-auth-packet.service.js";
import { createPayerBehaviorService } from "../payer-behavior/payerBehavior.service.js";
import {
  classifyPriorAuthScoreGate,
  payerScoreSnapshotToResult,
  scorePacketForPriorAuthGate,
} from "./prior-auth-score-gate.js";
import {
  attachmentsFromStoredPayload,
  mergeAttachmentsIntoStoredPayload,
  syncPriorAuthDocumentsFromAttachments,
} from "./prior-auth-submission-payload.js";
import { playbookService } from "../playbook/playbook.service.js";
import type { ScoreCaseResult } from "../payer-behavior/payerBehavior.types.js";
import { createValidatorService } from "../validation/validator.service.js";

function actorFromReq(req: Request): string {
  return (req as Request & { userId?: string }).userId ?? "system";
}

export function createPacketController(prisma: PrismaClient) {
  const payerBehavior = createPayerBehaviorService(prisma);
  const validatorService = createValidatorService(prisma);

  async function createPacket(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createPacketBodySchema.parse(req.body);
      const actor = actorFromReq(req);
      const { packetId, packetJson } = await createPacketWithInitialGeneration(
        prisma,
        {
          caseId: body.caseId,
          deviceType: body.deviceType,
          clinical: body.clinical,
          actor,
        },
      );
      res.status(201).json({ success: true, packetId, packet: packetJson });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "CASE_NOT_FOUND") {
        res.status(404).json({ error: "Case not found" });
        return;
      }
      next(err);
    }
  }

  async function listPacketsForCase(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const caseId = req.params.caseId;
      if (!caseId) {
        res.status(400).json({ error: "caseId required" });
        return;
      }
      const packets = await prisma.priorAuthPacket.findMany({
        where: { caseId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          caseId: true,
          status: true,
          payerScoreSnapshotId: true,
          payload: true,
          updatedAt: true,
          createdAt: true,
        },
      });
      res.json({ success: true, packets });
    } catch (error) {
      next(error);
    }
  }

  async function getPacket(req: Request, res: Response, next: NextFunction) {
    try {
      const packetId = req.params.packetId;
      const includePayerScore =
        req.query.includePayerScore === "1" || req.query.includePayerScore === "true";
      const packet = await prisma.priorAuthPacket.findUnique({
        where: { id: packetId },
      });
      if (!packet) {
        res.status(404).json({ error: "Packet not found" });
        return;
      }

      let payerScore: ScoreCaseResult | null = null;
      if (includePayerScore && packet.payerScoreSnapshotId) {
        const snap = await prisma.payerScoreSnapshot.findUnique({
          where: { id: packet.payerScoreSnapshotId },
        });
        if (snap) payerScore = payerScoreSnapshotToResult(snap);
      }

      const ids = parseDocumentRefs(packet.documents);
      const rows =
        ids.length > 0
          ? await prisma.priorAuthDocument.findMany({
              where: { id: { in: ids } },
            })
          : [];

      const packetView = hydratePriorAuthPacketView({
        id: packet.id,
        caseId: packet.caseId,
        status: packet.status,
        documentsJson: packet.documents,
        payloadJson: packet.payload,
        rows,
        updatedAt: packet.updatedAt,
      });

      res.json({
        success: true,
        packet: {
          id: packet.id,
          caseId: packet.caseId,
          status: packet.status,
          payerScoreSnapshotId: packet.payerScoreSnapshotId,
          documents: packet.documents,
          payload: packet.payload,
          createdAt: packet.createdAt,
          updatedAt: packet.updatedAt,
        },
        payerScore,
        packetView,
        documents: rows,
      });
    } catch (error) {
      next(error);
    }
  }

  async function generatePacket(req: Request, res: Response, next: NextFunction) {
    try {
      const packetId = req.params.packetId;
      const body = generatePacketBodySchema.parse(req.body);
      const actor = actorFromReq(req);
      const existing = await prisma.priorAuthPacket.findUnique({
        where: { id: packetId },
      });
      if (!existing) {
        res.status(404).json({ error: "Packet not found" });
        return;
      }
      const packetJson = await regeneratePacket(prisma, {
        packetId,
        clinical: body.clinical,
        actor,
      });
      res.json({ success: true, packet: packetJson });
    } catch (error) {
      next(error);
    }
  }

  async function postPacketPayerScore(req: Request, res: Response, next: NextFunction) {
    try {
      const packetId = req.params.packetId;
      const actor = actorFromReq(req);
      const packet = await prisma.priorAuthPacket.findUnique({ where: { id: packetId } });
      if (!packet) {
        res.status(404).json({ error: "Packet not found" });
        return;
      }
      const outcome = await scorePacketForPriorAuthGate(
        prisma,
        payerBehavior,
        packetId,
        actor,
      );
      res.json({
        success: true,
        gate: outcome.kind,
        snapshotId: outcome.snapshotId,
        score: outcome.score,
      });
    } catch (error) {
      next(error);
    }
  }

  async function generateAndSubmitPriorAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const body = generateAndSubmitPriorAuthBodySchema.parse(req.body);
      const actor = actorFromReq(req);

      const caseRow = await prisma.case.findUnique({ where: { id: body.caseId } });
      if (!caseRow) {
        res.status(404).json({ error: "Case not found" });
        return;
      }

      // Build packet first so validator can deterministically inspect documents + playbook output.
      const packet = await priorAuthPacketService.buildPacket(body.caseId, body.input);

      const payloadRecord = packet.payload as Record<string, unknown>;
      const playbookResult = await playbookService.execute({
        caseId: body.caseId,
        payerId: caseRow.payerId,
        planName: undefined,
        deviceCategory: body.input.device,
        hcpcsCode: body.input.hcpcs,
        diagnosisCode: body.input.diagnosis,
        packet: { attachments: attachmentsFromStoredPayload(packet.payload) },
        actor,
      });

      const mergedPayload = mergeAttachmentsIntoStoredPayload(
        payloadRecord,
        playbookResult.updatedPacket.attachments,
      );

      await prisma.priorAuthPacket.update({
        where: { id: packet.id },
        data: { payload: mergedPayload as object },
      });

      const documentIds = parseDocumentRefs(packet.documents);
      if (playbookResult.playbookId) {
        await syncPriorAuthDocumentsFromAttachments(prisma, {
          documentIds,
          attachments: playbookResult.updatedPacket.attachments,
          playbookExecutionId: playbookResult.executionId,
          playbookId: playbookResult.playbookId,
          playbookVersion: playbookResult.version!,
          payerId: caseRow.payerId,
          caseId: body.caseId,
          actor,
        });
      }

      const gate = await scorePacketForPriorAuthGate(
        prisma,
        payerBehavior,
        packet.id,
        actor,
      );

      // Validate against manuals/rules/playbooks before submission.
      const docRows =
        documentIds.length > 0
          ? await prisma.priorAuthDocument.findMany({ where: { id: { in: documentIds } } })
          : [];
      const mergedPayloadObj =
        mergedPayload && typeof mergedPayload === "object" ? (mergedPayload as any) : {};
      const validationDirect = await validatorService.validate({
        caseId: packet.caseId,
        payerId: caseRow.payerId,
        packet: {
          attachments: docRows.map((d) => ({ type: String(d.type), content: d.content })),
          patient: mergedPayloadObj.patient,
          physician: mergedPayloadObj.physician,
        },
      });

      if (gate.kind === "BLOCKED" || validationDirect.status === "BLOCK") {
        res.status(422).json({
          error: "Submission blocked: missing requirements",
          code:
            validationDirect.status === "BLOCK"
              ? "PRE_SUBMIT_VALIDATION_BLOCKED"
              : "PAYER_SCORE_BLOCKED",
          validation: validationDirect,
          snapshotId: gate.snapshotId,
          score: gate.score,
        });
        return;
      }

      if (gate.kind === "NEEDS_REVIEW" || validationDirect.status === "REVIEW") {
        await prisma.priorAuthPacket.update({
          where: { id: packet.id },
          data: { status: "NEEDS_REVIEW" },
        });
        res.json({ status: "REVIEW_REQUIRED", validation: validationDirect });
        return;
      }

      const payloadStored = mergedPayload as PacketPayloadStoredJson;

      const outboundPayload: Record<string, unknown> = {
        ...mergedPayload,
        // TODO: Map to Availity authorizations schema / extension fields per product docs.
        poseidonPriorAuthPacket: {
          schemaVersion: PACKET_SCHEMA_VERSION,
          packetId: packet.id,
          caseId: packet.caseId,
          documentIds,
          snapshotHash: payloadStored?.snapshotHash ?? null,
          generationVersion: payloadStored?.generationVersion ?? null,
          deviceType: payloadStored?.deviceType ?? null,
        },
      };

      const result = await availityClient.submitPriorAuth(
        outboundPayload,
        packet.caseId,
        actor,
      );

      await prisma.priorAuthRequest.create({
        data: {
          caseId: packet.caseId,
          requestPayload: outboundPayload as object,
          responsePayload: (result ?? {}) as object,
          status: "SUBMITTED",
          payerScoreSnapshotId: gate.snapshotId,
        },
      });

      await prisma.priorAuthPacket.update({
        where: { id: packet.id },
        data: { status: "SUBMITTED" },
      });

      logger.info(
        {
          generateAndSubmitPriorAuth: true,
          packetId: packet.id,
          caseId: packet.caseId,
          actor,
          payerScoreSnapshotId: gate.snapshotId,
          playbookId: playbookResult.playbookId,
        },
        "prior_auth_generate_and_submit",
      );

      res.json({
        success: true,
        packet: { ...packet, status: "SUBMITTED", payload: mergedPayload as object },
        result,
        snapshotId: gate.snapshotId,
        score: gate.score,
        playbook: {
          executionId: playbookResult.executionId,
          playbookId: playbookResult.playbookId,
          version: playbookResult.version,
          modifications: playbookResult.modifications,
          textAmendments: playbookResult.textAmendments,
        },
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "CASE_NOT_FOUND") {
        res.status(404).json({ error: "Case not found" });
        return;
      }
      next(err);
    }
  }

  async function submitPacketPriorAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const packetId = req.params.packetId;
      const body = submitPacketPriorAuthBodySchema.parse(req.body);
      const actor = actorFromReq(req);

      const packet = await prisma.priorAuthPacket.findUnique({
        where: { id: packetId },
      });

      if (!packet) {
        res.status(404).json({ error: "Packet not found" });
        return;
      }

      const gate = await scorePacketForPriorAuthGate(
        prisma,
        payerBehavior,
        packetId,
        actor,
      );

      const caseRow = await prisma.case.findUnique({ where: { id: packet.caseId } });
      if (!caseRow) {
        res.status(404).json({ error: "Case not found" });
        return;
      }

      const documentIds = parseDocumentRefs(packet.documents);
      const docRows =
        documentIds.length > 0
          ? await prisma.priorAuthDocument.findMany({ where: { id: { in: documentIds } } })
          : [];

      const payloadObj =
        packet.payload && typeof packet.payload === "object" ? (packet.payload as any) : {};

      const validation = await validatorService.validate({
        caseId: packet.caseId,
        payerId: caseRow.payerId,
        packet: {
          attachments: docRows.map((d) => ({ type: String(d.type), content: d.content })),
          patient: payloadObj.patient,
          physician: payloadObj.physician,
        },
      });

      if (validation.status === "BLOCK" || gate.kind === "BLOCKED") {
        res.status(422).json({
          error: "Submission blocked: missing requirements",
          code:
            validation.status === "BLOCK"
              ? "PRE_SUBMIT_VALIDATION_BLOCKED"
              : "PAYER_SCORE_BLOCKED",
          validation,
          snapshotId: gate.snapshotId,
          score: gate.score,
        });
        return;
      }

      if (validation.status === "REVIEW" || gate.kind === "NEEDS_REVIEW") {
        await prisma.priorAuthPacket.update({
          where: { id: packetId },
          data: { status: "NEEDS_REVIEW" },
        });
        res.json({ status: "REVIEW_REQUIRED", validation });
        return;
      }

      const payloadStored = packet.payload as PacketPayloadStoredJson;
      // `documentIds` already computed above.

      const outboundPayload: Record<string, unknown> = {
        ...(body.payload as Record<string, unknown>),
        // TODO: Map this traceability block to Availity-allowed extension fields per authorizations API product docs.
        poseidonPriorAuthPacket: {
          schemaVersion: PACKET_SCHEMA_VERSION,
          packetId: packet.id,
          caseId: packet.caseId,
          documentIds,
          snapshotHash: payloadStored?.snapshotHash ?? null,
          generationVersion: payloadStored?.generationVersion ?? null,
          deviceType: payloadStored?.deviceType ?? null,
        },
      };

      const result = await availityClient.submitPriorAuth(
        outboundPayload,
        packet.caseId,
        actor,
      );

      await prisma.priorAuthRequest.create({
        data: {
          caseId: packet.caseId,
          requestPayload: outboundPayload as object,
          responsePayload: (result ?? {}) as object,
          status: "SUBMITTED",
          payerScoreSnapshotId: gate.snapshotId,
        },
      });

      await prisma.priorAuthPacket.update({
        where: { id: packetId },
        data: { status: "SUBMITTED" },
      });

      logger.info(
        {
          priorAuthSubmittedWithPacket: true,
          packetId,
          caseId: packet.caseId,
          actor,
          payerScoreSnapshotId: gate.snapshotId,
          availityResponseKeys:
            result && typeof result === "object" ? Object.keys(result as object) : [],
        },
        "prior_auth_submitted_with_packet",
      );

      res.json({
        success: true,
        result,
        snapshotId: gate.snapshotId,
        score: gate.score,
      });
    } catch (error) {
      next(error);
    }
  }

  return {
    createPacket,
    listPacketsForCase,
    getPacket,
    generatePacket,
    postPacketPayerScore,
    generateAndSubmitPriorAuth,
    submitPacketPriorAuth,
  };
}
