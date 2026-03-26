"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewManualExtraction = previewManualExtraction;
exports.previewManualExtractionDeterministic = previewManualExtractionDeterministic;
const manual_requirement_extractor_js_1 = require("../governance/manual-requirement-extractor.js");
const manualRequirementExtraction_service_js_1 = require("./manualRequirementExtraction.service.js");
/** Preview extraction (deterministic, optional LLM candidates when `useLlm` is true). */
async function previewManualExtraction(rawText, opts = {}) {
    return (0, manualRequirementExtraction_service_js_1.extractManualRequirementCandidates)(rawText, { useLlm: opts.useLlm ?? false });
}
/** Shorthand: regex-only preview without LLM metadata merging. */
function previewManualExtractionDeterministic(rawText) {
    return (0, manual_requirement_extractor_js_1.extractRequirementsFromManualText)(rawText);
}
//# sourceMappingURL=manualExtraction.service.js.map