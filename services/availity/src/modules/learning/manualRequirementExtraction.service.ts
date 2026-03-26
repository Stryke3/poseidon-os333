import type { PrismaClient } from "@prisma/client";
import { config } from "../../config.js";
import {
  MANUAL_EXTRACTION_AUTO_ACCEPT_CONFIDENCE,
  MANUAL_EXTRACTION_SOURCE,
  MANUAL_REQUIREMENT_REVIEW_STATE,
} from "../governance/governance.constants.js";
import {
  extractRequirementsFromManualText,
  type ExtractedRequirement,
} from "../governance/manual-requirement-extractor.js";
import { extractLlmManualRequirementCandidates } from "./manualRequirement.llm.js";
import { toManualRequirementCreateManyInput } from "./manualRequirement.mapper.js";
import type { ManualRequirementCandidate } from "./manualRequirement.types.js";

export type { ManualRequirementCandidate } from "./manualRequirement.types.js";

function deterministicToCandidates(
  rows: ExtractedRequirement[],
  opts: { reviewOnly?: boolean } = {},
): ManualRequirementCandidate[] {
  // Enforce excerpt traceability: deterministic extractor may theoretically emit null/empty excerpts.
  return rows
    .filter((r) => typeof r.sourceExcerpt === "string" && r.sourceExcerpt.trim().length > 0)
    .map((r) => {
      const conf = r.confidence ?? 0;
      const auto =
        opts.reviewOnly === true
          ? MANUAL_REQUIREMENT_REVIEW_STATE.PENDING_REVIEW
          : conf >= MANUAL_EXTRACTION_AUTO_ACCEPT_CONFIDENCE
            ? MANUAL_REQUIREMENT_REVIEW_STATE.AUTO_ACCEPT
            : MANUAL_REQUIREMENT_REVIEW_STATE.PENDING_REVIEW;
      return {
        ...r,
        sourceExcerpt: r.sourceExcerpt,
        reviewState: auto,
        extractionSource: MANUAL_EXTRACTION_SOURCE.DETERMINISTIC,
        active:
          opts.reviewOnly === true
            ? false
            : auto === MANUAL_REQUIREMENT_REVIEW_STATE.AUTO_ACCEPT,
      };
    });
}

function excerptsRoughlyOverlap(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length < 16 || y.length < 16) return x === y;
  return x.includes(y.slice(0, 24)) || y.includes(x.slice(0, 24));
}

function filterLlmAgainstDeterministic(
  det: ManualRequirementCandidate[],
  llm: ManualRequirementCandidate[],
): ManualRequirementCandidate[] {
  const excerpts = det.map((d) => d.sourceExcerpt ?? "").filter(Boolean);
  return llm.filter((item) => {
    const ex = item.sourceExcerpt ?? "";
    if (!ex) return false;
    return !excerpts.some((d) => excerptsRoughlyOverlap(d, ex));
  });
}

function hasTraceableExcerpt(rawText: string, excerpt: string | null | undefined): boolean {
  const ex = excerpt?.trim();
  if (!ex || ex.length < 3) return false;
  return rawText.includes(ex);
}

/**
 * Deterministic regex extraction plus optional LLM candidates (feature-flagged).
 * LLM rows are never auto-accepted for production use.
 */
export async function extractManualRequirementCandidates(
  rawText: string,
  opts: { useLlm?: boolean; reviewOnly?: boolean } = {},
): Promise<ManualRequirementCandidate[]> {
  const det = deterministicToCandidates(extractRequirementsFromManualText(rawText), {
    reviewOnly: opts.reviewOnly,
  });
  if (!opts.useLlm || !config.manualExtraction.llmEnabled) return det;
  if (!config.manualExtraction.openaiApiKey) {
    throw new Error("OPENAI_API_KEY_REQUIRED_FOR_MANUAL_EXTRACTION_LLM");
  }
  const llmRaw = await extractLlmManualRequirementCandidates(rawText);
  const llm = filterLlmAgainstDeterministic(det, llmRaw);
  return [...det, ...llm];
}

/**
 * Removes all non-reviewed requirements for the manual, then inserts fresh candidates.
 * APPROVED and REJECTED rows (human-reviewed) are never touched.
 */
export async function persistManualRequirementExtractions(
  prisma: PrismaClient,
  manualId: string,
  payerId: string,
  planName: string | null,
  rawText: string,
  opts: { useLlm?: boolean; reviewOnly?: boolean } = {},
): Promise<{ created: number; candidates: number }> {
  const candidates = await extractManualRequirementCandidates(rawText, {
    useLlm: opts.useLlm ?? false,
    reviewOnly: opts.reviewOnly,
  });
  const traceableCandidates = candidates.filter((c) => hasTraceableExcerpt(rawText, c.sourceExcerpt));
  const data = toManualRequirementCreateManyInput(manualId, payerId, planName, traceableCandidates);

  await prisma.$transaction(async (tx) => {
    await tx.manualRequirement.deleteMany({
      where: {
        manualId,
        reviewState: {
          notIn: [MANUAL_REQUIREMENT_REVIEW_STATE.APPROVED, MANUAL_REQUIREMENT_REVIEW_STATE.REJECTED],
        },
      },
    });
    if (data.length > 0) {
      await tx.manualRequirement.createMany({ data });
    }
  });

  return { created: data.length, candidates: candidates.length };
}
