"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.denialDetails = exports.denialQueue = exports.recordDenialOutcome = exports.submitRecoveryPacket = void 0;
exports.createDenialController = createDenialController;
exports.intakeDenial = intakeDenial;
exports.classifyDenialEvent = classifyDenialEvent;
exports.generateAppealPacket = generateAppealPacket;
const denial_schemas_js_1 = require("./denial.schemas.js");
const denial_classifier_js_1 = require("./denial.classifier.js");
const appeal_generator_service_js_1 = require("./appeal.generator.service.js");
const denial_recovery_service_js_1 = require("./denial.recovery.service.js");
const packet_hydrate_js_1 = require("../packet/packet-hydrate.js");
const payer_intelligence_audit_js_1 = require("../../lib/payer-intelligence-audit.js");
const logger_js_1 = require("../../lib/logger.js");
const prisma_js_1 = require("../../lib/prisma.js");
function actorFromReq(req) {
    return req.userId ?? "system";
}
function denialEventToPayload(row) {
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
async function loadPacketDocsForDenial(prisma, packetId) {
    if (!packetId)
        return [];
    const packet = await prisma.priorAuthPacket.findUnique({ where: { id: packetId } });
    if (!packet)
        return [];
    const docIds = (0, packet_hydrate_js_1.parseDocumentRefs)(packet.documents);
    if (docIds.length === 0)
        return [];
    const docs = await prisma.priorAuthDocument.findMany({
        where: { id: { in: docIds } },
    });
    return docs.map((d) => ({ type: String(d.type), content: String(d.content) }));
}
function createDenialController(prisma) {
    async function intake(req, res, next) {
        try {
            const input = denial_schemas_js_1.denialIntakeBodySchema.parse(req.body);
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
            await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
                action: "denial_intake",
                payerId: input.payerId,
                caseId: input.caseId ?? null,
                snapshotId: null,
                outcomeId: null,
                detail: { denialEventId: denialEvent.id, denialCode: input.denialCode ?? null },
                actor,
            });
            res.status(201).json({ success: true, denialEvent });
        }
        catch (err) {
            next(err);
        }
    }
    async function classify(req, res, next) {
        try {
            const body = denial_schemas_js_1.classifyDenialBodySchema.parse(req.body);
            const actor = actorFromReq(req);
            const event = await prisma.denialEvent.findUnique({ where: { id: body.denialEventId } });
            if (!event) {
                res.status(404).json({ error: "denialEventId not found" });
                return;
            }
            const payload = denialEventToPayload(event);
            const classification = (0, denial_classifier_js_1.classifyDenial)({
                denialCode: payload.denialCode ?? undefined,
                denialReasonText: payload.denialReasonText,
            });
            const snapshot = await prisma.denialClassificationSnapshot.create({
                data: {
                    denialEventId: event.id,
                    category: classification.category,
                    confidence: classification.confidence,
                    recoveryType: classification.recoveryType,
                    requiredFixes: classification.requiredFixes,
                    requiredAttachments: classification.requiredAttachments,
                    escalationSteps: classification.escalationSteps,
                    explanation: classification.explanation,
                },
            });
            await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
                action: "denial_classified",
                payerId: payload.payerId,
                caseId: payload.caseId,
                snapshotId: null,
                outcomeId: null,
                detail: { denialEventId: event.id, category: classification.category, snapshotId: snapshot.id },
                actor,
            });
            res.json({ success: true, classification, snapshot });
        }
        catch (err) {
            next(err);
        }
    }
    async function generateAppeal(req, res, next) {
        try {
            const body = denial_schemas_js_1.generateAppealBodySchema.parse(req.body);
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
            let classification;
            if (latest) {
                classification = {
                    category: latest.category,
                    confidence: latest.confidence ?? 0.6,
                    recoveryType: latest.recoveryType,
                    requiredFixes: Array.isArray(latest.requiredFixes) ? latest.requiredFixes : [],
                    requiredAttachments: Array.isArray(latest.requiredAttachments) ? latest.requiredAttachments : [],
                    escalationSteps: Array.isArray(latest.escalationSteps) ? latest.escalationSteps : [],
                    explanation: Array.isArray(latest.explanation) ? latest.explanation : [],
                };
            }
            else {
                // Deterministic fallback: classify now.
                const payload = denialEventToPayload(event);
                classification = (0, denial_classifier_js_1.classifyDenial)({
                    denialCode: payload.denialCode ?? undefined,
                    denialReasonText: payload.denialReasonText,
                });
            }
            const packetDocs = await loadPacketDocsForDenial(prisma, event.packetId);
            const denialPayload = denialEventToPayload(event);
            const draft = (0, appeal_generator_service_js_1.generateAppealDraft)({
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
                    rebuttalPoints: draft.rebuttalPoints,
                    attachmentChecklist: draft.attachmentChecklist,
                    payload: draft.payload,
                    status: "DRAFT",
                },
            });
            await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
                action: "denial_appeal_generated",
                payerId: event.payerId,
                caseId: event.caseId,
                snapshotId: null,
                outcomeId: null,
                detail: { denialEventId: event.id, appealPacketId: appealPacket.id },
                actor,
            });
            logger_js_1.logger.info({ denialAppealGenerated: true, denialEventId: event.id, appealPacketId: appealPacket.id }, "denial_appeal_generated");
            res.status(201).json({ success: true, appealPacket, classification });
        }
        catch (err) {
            next(err);
        }
    }
    async function submitRecovery(req, res, next) {
        try {
            const body = denial_schemas_js_1.submitRecoveryBodySchema.parse(req.body);
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
            await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
                action: "appeal_packet_submitted",
                payerId: denialEvent?.payerId ?? null,
                caseId: updated.caseId ?? null,
                detail: { appealPacketId: updated.id, denialEventId: updated.denialEventId, status: updated.status },
                actor,
            });
            res.json({ success: true, appealPacket: updated });
        }
        catch (err) {
            next(err);
        }
    }
    async function outcome(req, res, next) {
        try {
            const body = denial_schemas_js_1.denialOutcomeBodySchema.parse(req.body);
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
            await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma, {
                action: "appeal_outcome_recorded",
                payerId: denialEvent?.payerId ?? null,
                caseId: appealPacket.caseId ?? null,
                detail: { appealPacketId: appealPacket.id, outcome: body.outcome, appealOutcomeId: created.id },
                actor,
            });
            res.status(201).json({ success: true, outcome: created });
        }
        catch (err) {
            next(err);
        }
    }
    async function queue(req, res, next) {
        try {
            const query = denial_schemas_js_1.denialQueueQuerySchema.parse(req.query ?? {});
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
                if (needsClassification && latestClass)
                    continue;
                if (readyToAppeal && (!latestClass || latestAppeal))
                    continue;
                enriched.push({
                    denialEvent: e,
                    latestClassification: latestClass,
                    latestAppealPacket: latestAppeal,
                });
            }
            res.json({ success: true, queue: enriched });
        }
        catch (err) {
            next(err);
        }
    }
    async function getDetails(req, res, next) {
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
        }
        catch (err) {
            next(err);
        }
    }
    return { intake, classify, generateAppeal, submitRecovery, outcome, queue, getDetails };
}
// Named exports for router wiring (and to match your preferred style).
const defaultHandlers = createDenialController(prisma_js_1.prisma);
async function intakeDenial(req, res, next) {
    try {
        const result = await denial_recovery_service_js_1.denialRecoveryService.intake(req.body);
        res.json({ success: true, result });
    }
    catch (error) {
        next(error);
    }
}
async function classifyDenialEvent(req, res, next) {
    try {
        const { denialEventId } = req.body;
        if (!denialEventId || typeof denialEventId !== "string" || !denialEventId.trim()) {
            res.status(400).json({ error: "denialEventId is required" });
            return;
        }
        const result = await denial_recovery_service_js_1.denialRecoveryService.classifyAndSnapshot(denialEventId.trim());
        res.json({ success: true, result });
    }
    catch (error) {
        next(error);
    }
}
async function generateAppealPacket(req, res, next) {
    try {
        const { denialEventId } = req.body;
        if (!denialEventId || typeof denialEventId !== "string" || !denialEventId.trim()) {
            res.status(400).json({ error: "denialEventId is required" });
            return;
        }
        const result = await denial_recovery_service_js_1.denialRecoveryService.generateRecoveryPacket(req.body);
        res.json({ success: true, result });
    }
    catch (error) {
        next(error);
    }
}
exports.submitRecoveryPacket = defaultHandlers.submitRecovery;
exports.recordDenialOutcome = defaultHandlers.outcome;
exports.denialQueue = defaultHandlers.queue;
exports.denialDetails = defaultHandlers.getDetails;
//# sourceMappingURL=denial.controller.js.map