"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePacketCore = generatePacketCore;
exports.createPacketWithInitialGeneration = createPacketWithInitialGeneration;
exports.regeneratePacket = regeneratePacket;
const packet_builder_js_1 = require("./packet-builder.js");
const packet_snapshot_js_1 = require("./packet-snapshot.js");
const template_engine_js_1 = require("./template-engine.js");
const template_registry_js_1 = require("./template-registry.js");
const logger_js_1 = require("../../lib/logger.js");
const compliance_js_1 = require("./compliance.js");
const playbook_service_js_1 = require("../playbook/playbook.service.js");
function readPayloadGenerationVersion(payload) {
    if (!payload || typeof payload !== "object")
        return 0;
    const v = payload.generationVersion;
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function readDeviceTypeFromPayload(payload) {
    if (!payload || typeof payload !== "object")
        return "DME_GENERIC";
    const d = payload.deviceType;
    return typeof d === "string" && d.length > 0 ? d : "DME_GENERIC";
}
async function generatePacketCore(tx, packetId, clinical, actor) {
    const packet = await tx.priorAuthPacket.findUnique({
        where: { id: packetId },
        include: { case: true },
    });
    if (!packet || !packet.case) {
        throw new Error("PACKET_NOT_FOUND");
    }
    const snapshotModel = (0, packet_snapshot_js_1.buildPacketGenerationSnapshot)(packet.case, clinical);
    const snapshotHash = (0, packet_snapshot_js_1.hashSnapshot)(snapshotModel);
    const generationVersion = readPayloadGenerationVersion(packet.payload) + 1;
    const deviceType = readDeviceTypeFromPayload(packet.payload);
    const templateSet = (0, template_registry_js_1.getTemplateSetForDeviceType)(deviceType);
    const docOutputs = [];
    const documentIds = [];
    for (const t of templateSet.templates) {
        const lastForType = await tx.priorAuthDocument.findFirst({
            where: { caseId: packet.caseId, type: t.docType },
            orderBy: { version: "desc" },
        });
        const docVersion = (lastForType?.version ?? 0) + 1;
        const ctx = (0, packet_snapshot_js_1.snapshotToRenderContext)(snapshotModel);
        const vars = (0, template_engine_js_1.variablesForTemplate)(t.body, ctx);
        const renderedText = (0, template_engine_js_1.renderTemplate)(t.body, vars);
        const provenance = (0, template_engine_js_1.provenanceForTemplate)(t.body);
        const row = await tx.priorAuthDocument.create({
            data: {
                caseId: packet.caseId,
                type: t.docType,
                content: renderedText,
                inputSnapshot: {
                    ...snapshotModel,
                    _packetGen: { templateId: t.id, provenance },
                    _compliance: {
                        policyVersion: compliance_js_1.CLINICAL_GENERATION_POLICY_VERSION,
                        rules: [...compliance_js_1.CLINICAL_GENERATION_RULES],
                        placeholderProvenance: provenance,
                    },
                },
                version: docVersion,
            },
        });
        documentIds.push(row.id);
        docOutputs.push({
            type: t.docType,
            templateId: t.id,
            docVersion,
            renderedText,
            provenance,
        });
    }
    const payloadStored = (0, packet_builder_js_1.buildPayloadStored)({
        generationVersion,
        snapshotHash,
        deviceType,
    });
    const packetView = (0, packet_builder_js_1.buildPriorAuthPacketJson)({
        packetId,
        caseId: packet.caseId,
        status: "READY",
        deviceType,
        snapshotHash,
        generationVersion,
        documentIds,
        documents: docOutputs,
    });
    await tx.priorAuthPacket.update({
        where: { id: packetId },
        data: {
            status: "READY",
            documents: { documentIds },
            payload: payloadStored,
        },
    });
    const packetViewAfterPlaybook = await (0, playbook_service_js_1.applyPlaybookAfterPacketGeneration)(tx, {
        packetId,
        caseId: packet.caseId,
        clinical,
        packetView,
        actor,
    });
    logger_js_1.logger.info({
        packetGenerated: true,
        packetId,
        caseId: packet.caseId,
        actor,
        generationVersion,
        templateSet: templateSet.deviceTypeKey,
        documentCount: documentIds.length,
        playbookApplied: packetViewAfterPlaybook !== packetView,
    }, "packet_generated");
    return packetViewAfterPlaybook;
}
async function createPacketWithInitialGeneration(prisma, params) {
    return prisma.$transaction(async (tx) => {
        const caseRow = await tx.case.findUnique({ where: { id: params.caseId } });
        if (!caseRow) {
            throw new Error("CASE_NOT_FOUND");
        }
        const deviceType = params.deviceType ?? "DME_GENERIC";
        const packet = await tx.priorAuthPacket.create({
            data: {
                caseId: params.caseId,
                status: "DRAFT",
                documents: { documentIds: [] },
                payload: (0, packet_builder_js_1.buildPayloadStored)({
                    generationVersion: 0,
                    snapshotHash: "",
                    deviceType,
                }),
            },
        });
        logger_js_1.logger.info({
            packetCreated: true,
            packetId: packet.id,
            caseId: params.caseId,
            actor: params.actor,
            deviceType,
        }, "packet_created");
        const packetJson = await generatePacketCore(tx, packet.id, params.clinical, params.actor);
        return { packetId: packet.id, packetJson };
    });
}
async function regeneratePacket(prisma, params) {
    return prisma.$transaction(async (tx) => {
        return generatePacketCore(tx, params.packetId, params.clinical, params.actor);
    });
}
//# sourceMappingURL=packet-generator.service.js.map