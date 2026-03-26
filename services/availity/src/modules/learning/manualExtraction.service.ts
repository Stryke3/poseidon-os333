import {
  extractRequirementsFromManualText,
  type ExtractedRequirement,
} from "../governance/manual-requirement-extractor.js";
import { extractManualRequirementCandidates } from "./manualRequirementExtraction.service.js";
import type { ManualRequirementCandidate } from "./manualRequirement.types.js";

export type { ExtractedRequirement, ManualRequirementCandidate };

/** Preview extraction (deterministic, optional LLM candidates when `useLlm` is true). */
export async function previewManualExtraction(
  rawText: string,
  opts: { useLlm?: boolean } = {},
): Promise<ManualRequirementCandidate[]> {
  return extractManualRequirementCandidates(rawText, { useLlm: opts.useLlm ?? false });
}

/** Shorthand: regex-only preview without LLM metadata merging. */
export function previewManualExtractionDeterministic(rawText: string): ExtractedRequirement[] {
  return extractRequirementsFromManualText(rawText);
}
