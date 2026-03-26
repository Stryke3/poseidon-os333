"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreDocumentInput = scoreDocumentInput;
/**
 * ML scoring stage: input → scores (async for future HTTP/batch models).
 * Scores must be non-clinical (routing, complexity, risk band). Never emit diagnosis,
 * history, or findings not present in structured input.
 * TODO: Call your scoring service; pass only allowed features (per privacy policy).
 */
async function scoreDocumentInput(input, docType) {
    void docType;
    // Stub: length-only heuristic — not clinical inference. Replace with approved model.
    const textLen = (input.justification?.length ?? 0) +
        (input.limitations?.length ?? 0) +
        (input.failedTreatments?.length ?? 0);
    const complexityScore = Math.min(1, textLen / 2000);
    let riskBand = "low";
    if (complexityScore > 0.35)
        riskBand = "medium";
    if (complexityScore > 0.65)
        riskBand = "high";
    return {
        modelVersion: "stub-heuristic-1.0",
        riskBand,
        complexityScore,
    };
}
//# sourceMappingURL=ml-scoring.js.map