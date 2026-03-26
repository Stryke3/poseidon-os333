"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dmeGenericTemplateSet = void 0;
const document_templates_js_1 = require("../document.templates.js");
/**
 * Neutral DME templates: procedural language only; all facts are placeholders into the snapshot.
 * LMN/SWO use flat placeholders (see `lmn-swo.ts`); other docs use nested paths under case/clinical/derived.
 * TODO: Add device-category-specific templates (e.g. orthotics vs respiratory) per product line.
 */
exports.dmeGenericTemplateSet = {
    deviceTypeKey: "DME_GENERIC",
    templates: [
        {
            id: "dme_generic.lmn.v2",
            docType: "LMN",
            body: document_templates_js_1.LMN_TEMPLATE.trim(),
        },
        {
            id: "dme_generic.swo.v2",
            docType: "SWO",
            body: document_templates_js_1.SWO_TEMPLATE.trim(),
        },
        {
            id: "dme_generic.clinical_summary.v1",
            docType: "CLINICAL_SUMMARY",
            body: `CLINICAL SUMMARY (USER-ENTERED LINES ONLY)

The following lines were entered by a user and are reproduced without modification or supplementation:

{{derived.clinicalSummaryBlock}}

If no lines were provided, the system displays an explicit empty state below.

--- End of user-entered clinical summary ---

Diagnosis entries (as entered, code + optional description):
{{derived.diagnosisLinesJoined}}
`,
        },
        {
            id: "dme_generic.attachments_metadata.v1",
            docType: "ATTACHMENTS_METADATA",
            body: `ATTACHMENTS BUNDLE — METADATA

User-indexed attachments (labels only — binary content not stored in this packet row):
{{derived.attachmentManifestLines}}

Payer suggested required labels (non-binding hints):
{{payerRules.requiredAttachmentLabels}}
`,
        },
    ],
};
//# sourceMappingURL=dme-generic.js.map