"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAvailityHandlers = void 0;
exports.createAvailityController = createAvailityController;
const eligibility_js_1 = require("../../schemas/eligibility.js");
const token_cache_js_1 = require("../../lib/token-cache.js");
const dob_js_1 = require("../../lib/dob.js");
const availity_client_js_1 = require("../../client/availity-client.js");
const packet_js_1 = require("../../types/packet.js");
const packet_hydrate_js_1 = require("../packet/packet-hydrate.js");
const payerBehavior_service_js_1 = require("../payer-behavior/payerBehavior.service.js");
const prior_auth_score_gate_js_1 = require("../packet/prior-auth-score-gate.js");
function createAvailityController(prisma) {
    const payerBehavior = (0, payerBehavior_service_js_1.createPayerBehaviorService)(prisma);
    async function healthCheckAvaility(_req, res, next) {
        try {
            const result = await token_cache_js_1.availityAuthService.healthCheck();
            res.json(result);
        }
        catch (error) {
            next(error);
        }
    }
    async function checkEligibility(req, res, next) {
        try {
            const input = eligibility_js_1.eligibilityRequestSchema.parse(req.body);
            const actor = req.userId ?? "system";
            let caseRecord;
            if (input.caseId) {
                caseRecord = await prisma.case.findUnique({
                    where: { id: input.caseId },
                });
                if (!caseRecord) {
                    res.status(404).json({ error: "Case not found" });
                    return;
                }
            }
            else {
                const dob = (0, dob_js_1.parseYmdToUtcDate)(input.patient.dob);
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
            const normalized = await availity_client_js_1.availityClient.getEligibility({
                caseId: caseRecord.id,
                payerId: input.payerId,
                memberId: input.memberId,
                patient: input.patient,
                provider: input.provider,
            }, actor);
            const checkStatus = normalized.coverageActive === true ? "ACTIVE" : "UNKNOWN";
            await prisma.eligibilityCheck.create({
                data: {
                    caseId: caseRecord.id,
                    requestPayload: input,
                    responsePayload: (normalized.rawResponse ?? {}),
                    status: checkStatus,
                },
            });
            res.json({
                caseId: caseRecord.id,
                ...normalized,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async function submitPriorAuth(req, res, next) {
        try {
            const input = eligibility_js_1.priorAuthRequestSchema.parse(req.body);
            const actor = req.userId ?? "user";
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
            let outboundPayload = input.payload;
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
                const payloadStored = packet.payload;
                const documentIds = (0, packet_hydrate_js_1.parseDocumentRefs)(packet.documents);
                outboundPayload = {
                    ...outboundPayload,
                    // TODO: Rename / nest per Availity partner extension conventions once documented.
                    poseidonPriorAuthPacket: {
                        schemaVersion: packet_js_1.PACKET_SCHEMA_VERSION,
                        packetId: packet.id,
                        caseId: packet.caseId,
                        documentIds,
                        snapshotHash: payloadStored?.snapshotHash ?? null,
                        generationVersion: payloadStored?.generationVersion ?? null,
                        deviceType: payloadStored?.deviceType ?? null,
                    },
                };
            }
            let gateWrap = null;
            if (input.caseId || input.packetId) {
                try {
                    gateWrap = await (0, prior_auth_score_gate_js_1.scorePriorAuthSubmissionContext)(prisma, payerBehavior, { caseId: input.caseId, packetId: input.packetId }, actor);
                }
                catch (e) {
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
                        error: "Prior authorization cannot be submitted until required documentation is addressed.",
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
            const result = await availity_client_js_1.availityClient.submitPriorAuth(outboundPayload, caseIdForRequest, actor);
            const snapshotIdForRequest = gateWrap?.outcome.snapshotId ?? null;
            if (caseIdForRequest) {
                await prisma.priorAuthRequest.create({
                    data: {
                        caseId: caseIdForRequest,
                        requestPayload: outboundPayload,
                        responsePayload: (result ?? {}),
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
        }
        catch (error) {
            next(error);
        }
    }
    async function getPriorAuthStatus(req, res, next) {
        try {
            const authId = req.params.authId;
            const caseId = typeof req.query.caseId === "string" ? req.query.caseId : undefined;
            const actor = req.userId ?? "user";
            const result = await availity_client_js_1.availityClient.getPriorAuthStatus(authId, caseId, actor);
            res.json({ success: true, result });
        }
        catch (error) {
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
exports.createAvailityHandlers = createAvailityController;
//# sourceMappingURL=availity.controller.js.map