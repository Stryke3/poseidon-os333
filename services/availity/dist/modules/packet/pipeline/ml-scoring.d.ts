import type { DocumentGeneratorInput } from "../../../schemas/packet.js";
import type { MlScoreResult, PriorAuthDocType } from "./types.js";
/**
 * ML scoring stage: input → scores (async for future HTTP/batch models).
 * Scores must be non-clinical (routing, complexity, risk band). Never emit diagnosis,
 * history, or findings not present in structured input.
 * TODO: Call your scoring service; pass only allowed features (per privacy policy).
 */
export declare function scoreDocumentInput(input: DocumentGeneratorInput, docType: PriorAuthDocType): Promise<MlScoreResult>;
//# sourceMappingURL=ml-scoring.d.ts.map