import type { DocumentGeneratorInput } from "../../../schemas/packet.js";
import type { MlScoreResult, PriorAuthDocType } from "./types.js";

/**
 * ML scoring stage: input → scores (async for future HTTP/batch models).
 * Scores must be non-clinical (routing, complexity, risk band). Never emit diagnosis,
 * history, or findings not present in structured input.
 * TODO: Call your scoring service; pass only allowed features (per privacy policy).
 */
export async function scoreDocumentInput(
  input: DocumentGeneratorInput,
  docType: PriorAuthDocType,
): Promise<MlScoreResult> {
  void docType;
  // Stub: length-only heuristic — not clinical inference. Replace with approved model.
  const textLen =
    (input.justification?.length ?? 0) +
    (input.limitations?.length ?? 0) +
    (input.failedTreatments?.length ?? 0);
  const complexityScore = Math.min(1, textLen / 2000);
  let riskBand: MlScoreResult["riskBand"] = "low";
  if (complexityScore > 0.35) riskBand = "medium";
  if (complexityScore > 0.65) riskBand = "high";

  return {
    modelVersion: "stub-heuristic-1.0",
    riskBand,
    complexityScore,
  };
}
