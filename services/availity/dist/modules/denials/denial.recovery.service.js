"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.denialRecoveryService = void 0;
exports.buildRecoveryStrategy = buildRecoveryStrategy;
const prisma_js_1 = require("../../lib/prisma.js");
const denial_classifier_js_1 = require("./denial.classifier.js");
const appeal_generator_service_js_1 = require("./appeal.generator.service.js");
const denial_schemas_js_1 = require("./denial.schemas.js");
const packet_hydrate_js_1 = require("../packet/packet-hydrate.js");
const payer_intelligence_audit_js_1 = require("../../lib/payer-intelligence-audit.js");
const logger_js_1 = require("../../lib/logger.js");
async function loadPacketDocsForPacketId(packetId) {
    if (!packetId)
        return [];
    const packet = await prisma_js_1.prisma.priorAuthPacket.findUnique({ where: { id: packetId } });
    if (!packet)
        return [];
    const docIds = (0, packet_hydrate_js_1.parseDocumentRefs)(packet.documents);
    if (docIds.length === 0)
        return [];
    const docs = await prisma_js_1.prisma.priorAuthDocument.findMany({
        where: { id: { in: docIds } },
    });
    return docs.map((d) => ({ type: String(d.type), content: String(d.content) }));
}
function unique(arr) {
    return [...new Set(arr.filter((x) => typeof x === "string" && x.trim()))];
}
function docListForRecovery(category) {
    // Deterministic defaults. Attachments can be refined in controller using ManualRequirement scope.
    switch (category) {
        case "MISSING_DOCUMENTATION":
        case "ADMINISTRATIVE_DEFECT":
            return ["LMN", "SWO", "CLINICAL_SUMMARY"];
        case "MEDICAL_NECESSITY":
            return ["LMN", "CLINICAL_SUMMARY"];
        case "NON_COVERED_SERVICE":
            return ["LMN"];
        case "CODING_MISMATCH":
            return ["SWO", "CLINICAL_SUMMARY"];
        case "TIMELY_FILING":
        case "DUPLICATE":
            return ["LMN", "SWO"];
        case "ELIGIBILITY":
            return ["CLINICAL_SUMMARY"];
        default:
            return ["LMN", "SWO", "CLINICAL_SUMMARY"];
    }
}
function recoveryTypeForCategory(category) {
    switch (category) {
        case "MISSING_DOCUMENTATION":
        case "ADMINISTRATIVE_DEFECT":
        case "CODING_MISMATCH":
            return "RESUBMIT";
        case "MEDICAL_NECESSITY":
        case "NON_COVERED_SERVICE":
        case "TIMELY_FILING":
            return "APPEAL";
        case "DUPLICATE":
            return "REVIEW";
        case "ELIGIBILITY":
            return "REVIEW";
        default:
            return "REVIEW";
    }
}
/**
 * Deterministic recovery strategy generator (category → recovery plan).
 * Does not invent clinical facts. It only requests fixes/attachments based on denial category.
 */
function buildRecoveryStrategy(input, category, confidence, baseExplanation) {
    const recoveryType = recoveryTypeForCategory(category);
    const requiredAttachments = docListForRecovery(category);
    const requiredFixes = [];
    const escalationSteps = [];
    const explanation = [...baseExplanation];
    const denialReason = input.denialReasonText?.trim() ? input.denialReasonText.trim() : "(no denial reason text provided)";
    requiredFixes.push(`Address denial category: ${category}.`);
    requiredFixes.push(`Use the denied packet facts as evidence; do not introduce new clinical claims not present in packet documents.`);
    escalationSteps.push("Review denial reason and ensure the packet evidence matches the denial category.");
    escalationSteps.push(`If appeal/resubmission is elected, include a clear checklist of required attachments: ${requiredAttachments.join(", ")}.`);
    // Category-specific deterministic details.
    if (category === "MISSING_DOCUMENTATION" || category === "ADMINISTRATIVE_DEFECT") {
        requiredFixes.push("Add the missing or incomplete documents per denial reason text.");
        escalationSteps.push("If denial is due to administrative completeness, confirm signatures/required fields in each document.");
    }
    if (category === "MEDICAL_NECESSITY") {
        requiredFixes.push("Strengthen the rebuttal with packet-authored medical necessity statements (LMN + clinical summary excerpts).");
        escalationSteps.push("If the denial persists, consider escalation pathway per payer policy (peer-to-peer if available).");
    }
    if (category === "CODING_MISMATCH") {
        requiredFixes.push("Verify coding consistency between diagnosis and billed HCPCS using packet SWO/LMN text.");
    }
    if (category === "TIMELY_FILING") {
        requiredFixes.push("Prepare a timely-filing justification packet (include proof and correspondence excerpts present in packet documents, if any).");
    }
    if (category === "ELIGIBILITY") {
        requiredFixes.push("Confirm member eligibility/coverage details before resubmission/appeal.");
    }
    if (category === "DUPLICATE") {
        requiredFixes.push("Check for prior submissions and deduplicate identifiers; only resubmit after confirming the packet is materially different.");
        escalationSteps.push("If uncertain, route to human review to confirm duplication rationale.");
    }
    explanation.push(`RecoveryType=${recoveryType} computed deterministically from denial category (${confidence.toFixed(2)} confidence).`);
    return {
        recoveryType,
        requiredFixes: unique(requiredFixes),
        requiredAttachments: unique(requiredAttachments),
        escalationSteps: unique(escalationSteps),
        explanation: unique(explanation),
    };
}
class DenialRecoveryService {
    async intake(input) {
        // Ensure deterministic parsing + required field enforcement.
        const parsed = denial_schemas_js_1.denialIntakeBodySchema.parse(input);
        const denialEvent = await prisma_js_1.prisma.denialEvent.create({
            data: {
                caseId: parsed.caseId ?? null,
                payerId: parsed.payerId,
                planName: parsed.planName ?? null,
                authId: parsed.authId ?? null,
                denialCode: parsed.denialCode ?? null,
                denialReasonText: parsed.denialReasonText,
                denialCategory: null,
                packetId: parsed.packetId ?? null,
                playbookId: parsed.playbookId ?? null,
                playbookVersion: parsed.playbookVersion ?? null,
                scoreSnapshotId: parsed.scoreSnapshotId ?? null,
            },
        });
        await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma_js_1.prisma, {
            action: "denial_intake",
            payerId: parsed.payerId,
            caseId: parsed.caseId ?? null,
            snapshotId: null,
            outcomeId: null,
            detail: { denialEventId: denialEvent.id, denialCode: parsed.denialCode ?? null },
            actor: "system",
        });
        return denialEvent;
    }
    async classifyAndSnapshot(denialEventId) {
        const event = await prisma_js_1.prisma.denialEvent.findUnique({ where: { id: denialEventId } });
        if (!event)
            throw new Error("Denial event not found");
        const result = (0, denial_classifier_js_1.classifyDenial)({
            denialCode: event.denialCode ?? undefined,
            denialReasonText: event.denialReasonText,
        });
        await prisma_js_1.prisma.denialEvent.update({
            where: { id: denialEventId },
            data: { denialCategory: result.category },
        });
        const snapshot = await prisma_js_1.prisma.denialClassificationSnapshot.create({
            data: {
                denialEventId,
                category: result.category,
                confidence: result.confidence,
                recoveryType: result.recoveryType,
                requiredFixes: result.requiredFixes,
                requiredAttachments: result.requiredAttachments,
                escalationSteps: result.escalationSteps,
                explanation: result.explanation,
            },
        });
        await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma_js_1.prisma, {
            action: "denial_classified",
            payerId: event.payerId,
            caseId: event.caseId,
            snapshotId: snapshot.id,
            outcomeId: null,
            detail: { denialEventId: event.id, category: result.category },
            actor: "system",
        });
        return snapshot;
    }
    async generateRecoveryPacket(input) {
        const event = await prisma_js_1.prisma.denialEvent.findUnique({ where: { id: input.denialEventId } });
        if (!event)
            throw new Error("Denial event not found");
        let snapshot = await prisma_js_1.prisma.denialClassificationSnapshot.findFirst({
            where: { denialEventId: input.denialEventId },
            orderBy: { createdAt: "desc" },
        });
        // Ensure there is always a persisted classification snapshot to link from the appeal.
        if (!snapshot) {
            snapshot = await this.classifyAndSnapshot(input.denialEventId);
        }
        const classification = {
            category: snapshot.category,
            confidence: snapshot.confidence ?? 0.6,
            recoveryType: snapshot.recoveryType,
            requiredFixes: Array.isArray(snapshot.requiredFixes)
                ? snapshot.requiredFixes
                : [],
            requiredAttachments: Array.isArray(snapshot.requiredAttachments)
                ? snapshot.requiredAttachments
                : [],
            escalationSteps: Array.isArray(snapshot.escalationSteps)
                ? snapshot.escalationSteps
                : [],
            explanation: Array.isArray(snapshot.explanation)
                ? snapshot.explanation
                : [],
        };
        // Deterministic traceability: use packet docs as evidence inputs only.
        const packetDocs = await loadPacketDocsForPacketId(event.packetId);
        const denialPayload = {
            id: event.id,
            caseId: event.caseId,
            payerId: event.payerId,
            denialCode: event.denialCode,
            denialReasonText: event.denialReasonText,
            denialCategory: event.denialCategory,
            packetId: event.packetId,
            playbookId: event.playbookId,
            playbookVersion: event.playbookVersion,
            scoreSnapshotId: event.scoreSnapshotId,
        };
        const draft = (0, appeal_generator_service_js_1.generateAppealDraft)({
            denial: denialPayload,
            classification,
            packetDocs,
            classificationSnapshotId: snapshot.id,
        });
        const appealPacket = await prisma_js_1.prisma.appealPacket.create({
            data: {
                denialEventId: event.id,
                caseId: event.caseId,
                recoveryType: classification.recoveryType,
                letterText: draft.letterText,
                rebuttalPoints: draft.rebuttalPoints,
                attachmentChecklist: draft.attachmentChecklist,
                payload: draft.payload,
                status: "DRAFT",
            },
        });
        await (0, payer_intelligence_audit_js_1.writePayerIntelligenceAudit)(prisma_js_1.prisma, {
            action: "denial_appeal_generated",
            payerId: event.payerId,
            caseId: event.caseId,
            snapshotId: snapshot.id ?? null,
            outcomeId: null,
            detail: { denialEventId: event.id, appealPacketId: appealPacket.id },
            actor: "system",
        });
        logger_js_1.logger.info({ denialAppealGenerated: true, denialEventId: event.id, appealPacketId: appealPacket.id }, "denial_appeal_generated");
        return { appealPacket, classification };
    }
}
exports.denialRecoveryService = new DenialRecoveryService();
//# sourceMappingURL=denial.recovery.service.js.map