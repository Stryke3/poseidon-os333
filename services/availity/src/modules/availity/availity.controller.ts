import type { Request, Response, NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";
import {
  eligibilityRequestSchema,
  priorAuthRequestSchema,
} from "../../schemas/eligibility.js";
import { availityAuthService } from "../../lib/token-cache.js";
import { parseYmdToUtcDate } from "../../lib/dob.js";
import { availityClient } from "../../client/availity-client.js";
import { PACKET_SCHEMA_VERSION } from "../../types/packet.js";
import type { PacketPayloadStoredJson } from "../../types/packet.js";
import { parseDocumentRefs } from "../packet/packet-hydrate.js";
import { createPayerBehaviorService } from "../payer-behavior/payerBehavior.service.js";
import { scorePriorAuthSubmissionContext } from "../packet/prior-auth-score-gate.js";

export function createAvailityController(prisma: PrismaClient) {
  const payerBehavior = createPayerBehaviorService(prisma);
  async function healthCheckAvaility(
    _req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const result = await availityAuthService.healthCheck();
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async function checkEligibility(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const input = eligibilityRequestSchema.parse(req.body);
      const actor = (req as Request & { userId?: string }).userId ?? "system";

      let caseRecord;

      if (input.caseId) {
        caseRecord = await prisma.case.findUnique({
          where: { id: input.caseId },
        });
        if (!caseRecord) {
          res.status(404).json({ error: "Case not found" });
          return;
        }
      } else {
        const dob = parseYmdToUtcDate(input.patient.dob);
        caseRecord = await prisma.case.findFirst({
          where: {
            patientFirstName: input.patient.firstName,
            patientLastName: input.patient.lastName,
            dob,
            memberId: input.memberId,
            payerId: input.payerId,
          },
        });

        if (!caseRecord) {
          caseRecord = await prisma.case.create({
            data: {
              patientFirstName: input.patient.firstName,
              patientLastName: input.patient.lastName,
              dob,
              memberId: input.memberId,
              payerId: input.payerId,
              status: "open",
            },
          });
        }
      }

      // TODO: Cross-check normalized fields and persisted JSON with Availity eligibility response spec
      // (coverages vs benefits envelopes) before production cutover.
      const normalized = await availityClient.getEligibility(
        {
          caseId: caseRecord.id,
          payerId: input.payerId,
          memberId: input.memberId,
          patient: input.patient,
          provider: input.provider,
        },
        actor,
      );

      const checkStatus =
        normalized.coverageActive === true ? "ACTIVE" : "UNKNOWN";

      await prisma.eligibilityCheck.create({
        data: {
          caseId: caseRecord.id,
          requestPayload: input as object,
          responsePayload: (normalized.rawResponse ?? {}) as object,
          status: checkStatus,
        },
      });

      res.json({
        caseId: caseRecord.id,
        ...normalized,
      });
    } catch (error) {
      next(error);
    }
  }

  async function submitPriorAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const input = priorAuthRequestSchema.parse(req.body);
      const actor = (req as Request & { userId?: string }).userId ?? "user";

      if (input.caseId) {
        const existing = await prisma.case.findUnique({
          where: { id: input.caseId },
        });
        if (!existing) {
          res.status(404).json({ error: "Case not found" });
          return;
        }
      }

      // TODO: Validate `input.payload` against Availity authorizations API schema (line-of-business specific).
      let outboundPayload = input.payload as Record<string, unknown>;
      let caseIdForRequest = input.caseId;

      if (input.packetId) {
        const packet = await prisma.priorAuthPacket.findUnique({
          where: { id: input.packetId },
        });
        if (!packet) {
          res.status(404).json({ error: "Packet not found" });
          return;
        }
        if (input.caseId && packet.caseId !== input.caseId) {
          res.status(400).json({ error: "packetId does not match caseId" });
          return;
        }
        caseIdForRequest = caseIdForRequest ?? packet.caseId;
        const payloadStored = packet.payload as PacketPayloadStoredJson;
        const documentIds = parseDocumentRefs(packet.documents);
        outboundPayload = {
          ...outboundPayload,
          // TODO: Rename / nest per Availity partner extension conventions once documented.
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
      }

      let gateWrap: Awaited<ReturnType<typeof scorePriorAuthSubmissionContext>> | null =
        null;
      if (input.caseId || input.packetId) {
        try {
          gateWrap = await scorePriorAuthSubmissionContext(
            prisma,
            payerBehavior,
            { caseId: input.caseId, packetId: input.packetId },
            actor,
          );
        } catch (e: unknown) {
          if (e instanceof Error && e.message === "CASE_NOT_FOUND") {
            res.status(404).json({ error: "Case not found" });
            return;
          }
          throw e;
        }
      }

      if (gateWrap) {
        const { outcome, resolvedPacketId } = gateWrap;
        if (outcome.kind === "BLOCKED") {
          res.status(422).json({
            error:
              "Prior authorization cannot be submitted until required documentation is addressed.",
            code: "PAYER_SCORE_BLOCKED",
            missingRequirements: outcome.score.missingRequirements,
            predictedDenialReasons: outcome.score.predictedDenialReasons,
            snapshotId: outcome.snapshotId,
            score: outcome.score,
          });
          return;
        }
        if (outcome.kind === "NEEDS_REVIEW") {
          const packetPk = input.packetId ?? resolvedPacketId;
          if (packetPk) {
            await prisma.priorAuthPacket.update({
              where: { id: packetPk },
              data: { status: "NEEDS_REVIEW" },
            });
          }
          res.json({
            success: true,
            routedToReview: true,
            message: "Packet held for manual review based on payer intelligence score.",
            snapshotId: outcome.snapshotId,
            score: outcome.score,
          });
          return;
        }
      }

      const result = await availityClient.submitPriorAuth(
        outboundPayload,
        caseIdForRequest,
        actor,
      );

      const snapshotIdForRequest = gateWrap?.outcome.snapshotId ?? null;

      if (caseIdForRequest) {
        await prisma.priorAuthRequest.create({
          data: {
            caseId: caseIdForRequest,
            requestPayload: outboundPayload as object,
            responsePayload: (result ?? {}) as object,
            status: "SUBMITTED",
            payerScoreSnapshotId: snapshotIdForRequest,
          },
        });
      }

      if (input.packetId) {
        await prisma.priorAuthPacket.update({
          where: { id: input.packetId },
          data: { status: "SUBMITTED" },
        });
      }

      res.json({
        success: true,
        result,
        ...(snapshotIdForRequest
          ? { snapshotId: snapshotIdForRequest, score: gateWrap?.outcome.score }
          : {}),
      });
    } catch (error) {
      next(error);
    }
  }

  async function getPriorAuthStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const authId = req.params.authId;
      const caseId =
        typeof req.query.caseId === "string" ? req.query.caseId : undefined;
      const actor = (req as Request & { userId?: string }).userId ?? "user";

      const result = await availityClient.getPriorAuthStatus(
        authId,
        caseId,
        actor,
      );

      res.json({ success: true, result });
    } catch (error) {
      next(error);
    }
  }

  return {
    healthCheckAvaility,
    checkEligibility,
    submitPriorAuth,
    getPriorAuthStatus,
  };
}

/** @deprecated Use createAvailityController */
export const createAvailityHandlers = createAvailityController;
