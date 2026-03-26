"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentGeneratorService = exports.DocumentGeneratorService = void 0;
const prisma_js_1 = require("../../lib/prisma.js");
const compliance_js_1 = require("./compliance.js");
const document_renderer_js_1 = require("./document.renderer.js");
const document_templates_js_1 = require("./document.templates.js");
const run_document_pipeline_js_1 = require("./pipeline/run-document-pipeline.js");
/**
 * Document path: **input → ML scoring → template modifier → render → output** (see `pipeline/`).
 * ML/template stages must not inject clinical prose — see `compliance.ts`.
 * Every row: full `inputSnapshot` + monotonic `version` per (caseId, type).
 */
async function nextDocumentVersion(caseId, type) {
    const last = await prisma_js_1.prisma.priorAuthDocument.findFirst({
        where: { caseId, type },
        orderBy: { version: "desc" },
    });
    return (last?.version ?? 0) + 1;
}
class DocumentGeneratorService {
    async generateLMN(caseId, input) {
        const { variables, scores } = await (0, run_document_pipeline_js_1.runDocumentPipeline)("LMN", input, () => ({
            patientName: `${input.patient.firstName} ${input.patient.lastName}`,
            dob: input.patient.dob,
            diagnosis: input.diagnosis?.trim()
                ? input.diagnosis.trim()
                : compliance_js_1.TEXT_NOT_SUPPLIED_BY_USER,
            device: input.device,
            clinicalJustification: input.justification?.trim() ?? "",
            limitations: input.limitations?.trim() ?? "",
            failedTreatments: input.failedTreatments?.trim() ?? "",
            physicianName: input.physician.name,
            npi: input.physician.npi?.trim() ?? "",
        }));
        const content = (0, document_renderer_js_1.renderTemplate)(document_templates_js_1.LMN_TEMPLATE.trim(), variables);
        const version = await nextDocumentVersion(caseId, "LMN");
        return prisma_js_1.prisma.priorAuthDocument.create({
            data: {
                caseId,
                type: "LMN",
                content,
                inputSnapshot: {
                    ...input,
                    _traceability: {
                        policyVersion: compliance_js_1.CLINICAL_GENERATION_POLICY_VERSION,
                        rules: [...compliance_js_1.CLINICAL_GENERATION_RULES],
                        variableSources: (0, compliance_js_1.lmnVariableSources)(),
                    },
                    _pipeline: { docType: "LMN", scores },
                },
                version,
            },
        });
    }
    async generateSWO(caseId, input) {
        const orderDate = input.orderDate?.trim() ?? "";
        const { variables, scores } = await (0, run_document_pipeline_js_1.runDocumentPipeline)("SWO", input, () => ({
            patientName: `${input.patient.firstName} ${input.patient.lastName}`,
            dob: input.patient.dob,
            device: input.device,
            hcpcs: input.hcpcs?.trim() ?? "",
            orderDate,
            physicianName: input.physician.name,
            npi: input.physician.npi?.trim() ?? "",
        }));
        const content = (0, document_renderer_js_1.renderTemplate)(document_templates_js_1.SWO_TEMPLATE.trim(), variables);
        const version = await nextDocumentVersion(caseId, "SWO");
        return prisma_js_1.prisma.priorAuthDocument.create({
            data: {
                caseId,
                type: "SWO",
                content,
                inputSnapshot: {
                    ...input,
                    _traceability: {
                        policyVersion: compliance_js_1.CLINICAL_GENERATION_POLICY_VERSION,
                        rules: [...compliance_js_1.CLINICAL_GENERATION_RULES],
                        variableSources: (0, compliance_js_1.swoVariableSources)(),
                        orderDateSupplied: Boolean(input.orderDate?.trim()),
                    },
                    _pipeline: { docType: "SWO", scores },
                },
                version,
            },
        });
    }
}
exports.DocumentGeneratorService = DocumentGeneratorService;
exports.documentGeneratorService = new DocumentGeneratorService();
//# sourceMappingURL=document-generator.service.js.map