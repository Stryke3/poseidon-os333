"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priorAuthPacketService = exports.PriorAuthPacketService = void 0;
const node_crypto_1 = require("node:crypto");
const prisma_js_1 = require("../../lib/prisma.js");
const packet_builder_js_1 = require("./packet-builder.js");
const document_generator_service_js_1 = require("./document-generator.service.js");
function hashPacketInput(caseId, input) {
    return (0, node_crypto_1.createHash)("sha256")
        .update(JSON.stringify({ caseId, input }))
        .digest("hex");
}
/**
 * Builds an LMN + SWO pair via {@link documentGeneratorService}, then persists a
 * {@link PriorAuthPacket} with `documents: { documentIds }` (hydration-compatible)
 * and a submission-oriented `payload` (patient / device / physician / attachments + trace fields).
 */
class PriorAuthPacketService {
    async buildPacket(caseId, input) {
        const existingCase = await prisma_js_1.prisma.case.findUnique({ where: { id: caseId } });
        if (!existingCase) {
            throw new Error("CASE_NOT_FOUND");
        }
        const lmn = await document_generator_service_js_1.documentGeneratorService.generateLMN(caseId, input);
        const swo = await document_generator_service_js_1.documentGeneratorService.generateSWO(caseId, input);
        const packetCount = await prisma_js_1.prisma.priorAuthPacket.count({ where: { caseId } });
        const generationVersion = packetCount + 1;
        const snapshotHash = hashPacketInput(caseId, input);
        const submissionPayload = {
            patient: input.patient,
            device: input.device,
            physician: input.physician,
            attachments: [
                { type: "LMN", content: lmn.content },
                { type: "SWO", content: swo.content },
            ],
            ...(0, packet_builder_js_1.buildPayloadStored)({
                generationVersion,
                snapshotHash,
                deviceType: "DME_GENERIC",
            }),
        };
        return prisma_js_1.prisma.priorAuthPacket.create({
            data: {
                caseId,
                documents: {
                    documentIds: [lmn.id, swo.id],
                },
                payload: submissionPayload,
                status: "READY",
            },
        });
    }
}
exports.PriorAuthPacketService = PriorAuthPacketService;
exports.priorAuthPacketService = new PriorAuthPacketService();
//# sourceMappingURL=prior-auth-packet.service.js.map