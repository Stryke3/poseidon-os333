"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDocumentPipeline = runDocumentPipeline;
const ml_scoring_js_1 = require("./ml-scoring.js");
const template_modifier_js_1 = require("./template-modifier.js");
/**
 * input → ML scoring → template modifier → variables (ready for `renderTemplate`).
 */
async function runDocumentPipeline(docType, input, buildBaseVariables) {
    const scores = await (0, ml_scoring_js_1.scoreDocumentInput)(input, docType);
    const baseVariables = buildBaseVariables();
    const variables = (0, template_modifier_js_1.modifyTemplateVariables)({
        docType,
        input,
        scores,
        baseVariables,
    });
    return { variables, scores };
}
//# sourceMappingURL=run-document-pipeline.js.map