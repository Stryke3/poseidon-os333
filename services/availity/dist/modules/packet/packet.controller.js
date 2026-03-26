"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPacketController = createPacketController;
const packet_js_1 = require("../../schemas/packet.js");
const packet_generator_service_js_1 = require("./packet-generator.service.js");
const availity_client_js_1 = require("../../client/availity-client.js");
const packet_js_2 = require("../../types/packet.js");
const packet_hydrate_js_1 = require("./packet-hydrate.js");
const logger_js_1 = require("../../lib/logger.js");
const prior_auth_packet_service_js_1 = require("./prior-auth-packet.service.js");
const payerBehavior_service_js_1 = require("../payer-behavior/payerBehavior.service.js");
const prior_auth_score_gate_js_1 = require("./prior-auth-score-gate.js");
const prior_auth_submission_payload_js_1 = require("./prior-auth-submission-payload.js");
const playbook_service_js_1 = require("../playbook/playbook.service.js");
const validator_service_js_1 = require("../validation/validator.service.js");
function actorFromReq(req) {
    return req.userId ?? "system";
}
function createPacketController(prisma) {
    const payerBehavior = (0, payerBehavior_service_js_1.createPayerBehaviorService)(prisma);
    const validatorService = (0, validator_service_js_1.createValidatorService)(prisma);
    async function createPacket(req, res, next) {
        try {
            const body = packet_js_1.createPacketBodySchema.parse(req.body);
            const actor = actorFromReq(req);
            const { packetId, packetJson } = await (0, packet_generator_service_js_1.createPacketWithInitialGeneration)(prisma, {
                caseId: body.caseId,
                deviceType: body.deviceType,
                clinical: body.clinical,
                actor,
            });
            res.status(201).json({ success: true, packetId, packet: packetJson });
        }
        catch (err) {
            if (err instanceof Error && err.message === "CASE_NOT_FOUND") {
                res.status(404).json({ error: "Case not found" });
                return;
            }
            next(err);
        }
    }
    async function listPacketsForCase(req, res, next) {
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
        }
        catch (error) {
            next(error);
        }
    }
    async function getPacket(req, res, next) {
        try {
            const packetId = req.params.packetId;
            const includePayerScore = req.query.includePayerScore === "1" || req.query.includePayerScore === "true";
            const packet = await prisma.priorAuthPacket.findUnique({
                where: { id: packetId },
            });
            if (!packet) {
                res.status(404).json({ error: "Packet not found" });
                return;
            }
            let payerScore = null;
            if (includePayerScore && packet.payerScoreSnapshotId) {
                const snap = await prisma.payerScoreSnapshot.findUnique({
                    where: { id: packet.payerScoreSnapshotId },
                });
                if (snap)
                    payerScore = (0, prior_auth_score_gate_js_1.payerScoreSnapshotToResult)(snap);
            }
            const ids = (0, packet_hydrate_js_1.parseDocumentRefs)(packet.documents);
            const rows = ids.length > 0
                ? await prisma.priorAuthDocument.findMany({
                    where: { id: { in: ids } },
                })
                : [];
            const packetView = (0, packet_hydrate_js_1.hydratePriorAuthPacketView)({
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
        }
        catch (error) {
            next(error);
        }
    }
    async function generatePacket(req, res, next) {
        try {
            const packetId = req.params.packetId;
            const body = packet_js_1.generatePacketBodySchema.parse(req.body);
            const actor = actorFromReq(req);
            const existing = await prisma.priorAuthPacket.findUnique({
                where: { id: packetId },
            });
            if (!existing) {
                res.status(404).json({ error: "Packet not found" });
                return;
            }
            const packetJson = await (0, packet_generator_service_js_1.regeneratePacket)(prisma, {
                packetId,
                clinical: body.clinical,
                actor,
            });
            res.json({ success: true, packet: packetJson });
        }
        catch (error) {
            next(error);
        }
    }
    async function postPacketPayerScore(req, res, next) {
        try {
            const packetId = req.params.packetId;
            const actor = actorFromReq(req);
            const packet = await prisma.priorAuthPacket.findUnique({ where: { id: packetId } });
            if (!packet) {
                res.status(404).json({ error: "Packet not found" });
                return;
            }
            const outcome = await (0, prior_auth_score_gate_js_1.scorePacketForPriorAuthGate)(prisma, payerBehavior, packetId, actor);
            res.json({
                success: true,
                gate: outcome.kind,
                snapshotId: outcome.snapshotId,
                score: outcome.score,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async function generateAndSubmitPriorAuth(req, res, next) {
        try {
            const body = packet_js_1.generateAndSubmitPriorAuthBodySchema.parse(req.body);
            const actor = actorFromReq(req);
            const caseRow = await prisma.case.findUnique({ where: { id: body.caseId } });
            if (!caseRow) {
                res.status(404).json({ error: "Case not found" });
                return;
            }
            // Build packet first so validator can deterministically inspect documents + playbook output.
            const packet = await prior_auth_packet_service_js_1.priorAuthPacketService.buildPacket(body.caseId, body.input);
            const payloadRecord = packet.payload;
            const playbookResult = await playbook_service_js_1.playbookService.execute({
                caseId: body.caseId,
                payerId: caseRow.payerId,
                planName: undefined,
                deviceCategory: body.input.device,
                hcpcsCode: body.input.hcpcs,
                diagnosisCode: body.input.diagnosis,
                packet: { attachments: (0, prior_auth_submission_payload_js_1.attachmentsFromStoredPayload)(packet.payload) },
                actor,
            });
            const mergedPayload = (0, prior_auth_submission_payload_js_1.mergeAttachmentsIntoStoredPayload)(payloadRecord, playbookResult.updatedPacket.attachments);
            await prisma.priorAuthPacket.update({
                where: { id: packet.id },
                data: { payload: mergedPayload },
            });
            const documentIds = (0, packet_hydrate_js_1.parseDocumentRefs)(packet.documents);
            if (playbookResult.playbookId) {
                await (0, prior_auth_submission_payload_js_1.syncPriorAuthDocumentsFromAttachments)(prisma, {
                    documentIds,
                    attachments: playbookResult.updatedPacket.attachments,
                    playbookExecutionId: playbookResult.executionId,
                    playbookId: playbookResult.playbookId,
                    playbookVersion: playbookResult.version,
                    payerId: caseRow.payerId,
                    caseId: body.caseId,
                    actor,
                });
            }
            const gate = await (0, prior_auth_score_gate_js_1.scorePacketForPriorAuthGate)(prisma, payerBehavior, packet.id, actor);
            // Validate against manuals/rules/playbooks before submission.
            const docRows = documentIds.length > 0
                ? await prisma.priorAuthDocument.findMany({ where: { id: { in: documentIds } } })
                : [];
            const mergedPayloadObj = mergedPayload && typeof mergedPayload === "object" ? mergedPayload : {};
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
                    code: validationDirect.status === "BLOCK"
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
            const payloadStored = mergedPayload;
            const outboundPayload = {
                ...mergedPayload,
                // TODO: Map to Availity authorizations schema / extension fields per product docs.
                poseidonPriorAuthPacket: {
                    schemaVersion: packet_js_2.PACKET_SCHEMA_VERSION,
                    packetId: packet.id,
                    caseId: packet.caseId,
                    documentIds,
                    snapshotHash: payloadStored?.snapshotHash ?? null,
                    generationVersion: payloadStored?.generationVersion ?? null,
                    deviceType: payloadStored?.deviceType ?? null,
                },
            };
            const result = await availity_client_js_1.availityClient.submitPriorAuth(outboundPayload, packet.caseId, actor);
            await prisma.priorAuthRequest.create({
                data: {
                    caseId: packet.caseId,
                    requestPayload: outboundPayload,
                    responsePayload: (result ?? {}),
                    status: "SUBMITTED",
                    payerScoreSnapshotId: gate.snapshotId,
                },
            });
            await prisma.priorAuthPacket.update({
                where: { id: packet.id },
                data: { status: "SUBMITTED" },
            });
            logger_js_1.logger.info({
                generateAndSubmitPriorAuth: true,
                packetId: packet.id,
                caseId: packet.caseId,
                actor,
                payerScoreSnapshotId: gate.snapshotId,
                playbookId: playbookResult.playbookId,
            }, "prior_auth_generate_and_submit");
            res.json({
                success: true,
                packet: { ...packet, status: "SUBMITTED", payload: mergedPayload },
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
        }
        catch (err) {
            if (err instanceof Error && err.message === "CASE_NOT_FOUND") {
                res.status(404).json({ error: "Case not found" });
                return;
            }
            next(err);
        }
    }
    async function submitPacketPriorAuth(req, res, next) {
        try {
            const packetId = req.params.packetId;
            const body = packet_js_1.submitPacketPriorAuthBodySchema.parse(req.body);
            const actor = actorFromReq(req);
            const packet = await prisma.priorAuthPacket.findUnique({
                where: { id: packetId },
            });
            if (!packet) {
                res.status(404).json({ error: "Packet not found" });
                return;
            }
            const gate = await (0, prior_auth_score_gate_js_1.scorePacketForPriorAuthGate)(prisma, payerBehavior, packetId, actor);
            const caseRow = await prisma.case.findUnique({ where: { id: packet.caseId } });
            if (!caseRow) {
                res.status(404).json({ error: "Case not found" });
                return;
            }
            const documentIds = (0, packet_hydrate_js_1.parseDocumentRefs)(packet.documents);
            const docRows = documentIds.length > 0
                ? await prisma.priorAuthDocument.findMany({ where: { id: { in: documentIds } } })
                : [];
            const payloadObj = packet.payload && typeof packet.payload === "object" ? packet.payload : {};
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
                    code: validation.status === "BLOCK"
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
            const payloadStored = packet.payload;
            // `documentIds` already computed above.
            const outboundPayload = {
                ...body.payload,
                // TODO: Map this traceability block to Availity-allowed extension fields per authorizations API product docs.
                poseidonPriorAuthPacket: {
                    schemaVersion: packet_js_2.PACKET_SCHEMA_VERSION,
                    packetId: packet.id,
                    caseId: packet.caseId,
                    documentIds,
                    snapshotHash: payloadStored?.snapshotHash ?? null,
                    generationVersion: payloadStored?.generationVersion ?? null,
                    deviceType: payloadStored?.deviceType ?? null,
                },
            };
            const result = await availity_client_js_1.availityClient.submitPriorAuth(outboundPayload, packet.caseId, actor);
            await prisma.priorAuthRequest.create({
                data: {
                    caseId: packet.caseId,
                    requestPayload: outboundPayload,
                    responsePayload: (result ?? {}),
                    status: "SUBMITTED",
                    payerScoreSnapshotId: gate.snapshotId,
                },
            });
            await prisma.priorAuthPacket.update({
                where: { id: packetId },
                data: { status: "SUBMITTED" },
            });
            logger_js_1.logger.info({
                priorAuthSubmittedWithPacket: true,
                packetId,
                caseId: packet.caseId,
                actor,
                payerScoreSnapshotId: gate.snapshotId,
                availityResponseKeys: result && typeof result === "object" ? Object.keys(result) : [],
            }, "prior_auth_submitted_with_packet");
            res.json({
                success: true,
                result,
                snapshotId: gate.snapshotId,
                score: gate.score,
            });
        }
        catch (error) {
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
//# sourceMappingURL=packet.controller.js.map