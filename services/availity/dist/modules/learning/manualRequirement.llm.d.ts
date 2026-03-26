import type { ManualRequirementCandidate } from "./manualRequirement.types.js";
/**
 * LLM-assisted candidates only — always `PENDING_REVIEW` / inactive until a human promotes them.
 * Requires `MANUAL_EXTRACTION_LLM=true` and `OPENAI_API_KEY`.
 */
export declare function extractLlmManualRequirementCandidates(manualText: string): Promise<ManualRequirementCandidate[]>;
//# sourceMappingURL=manualRequirement.llm.d.ts.map