import type { PrismaClient } from "@prisma/client";
import type { ManualRequirementCandidate } from "./manualRequirement.types.js";
export type { ManualRequirementCandidate } from "./manualRequirement.types.js";
/**
 * Deterministic regex extraction plus optional LLM candidates (feature-flagged).
 * LLM rows are never auto-accepted for production use.
 */
export declare function extractManualRequirementCandidates(rawText: string, opts?: {
    useLlm?: boolean;
    reviewOnly?: boolean;
}): Promise<ManualRequirementCandidate[]>;
/**
 * Removes all non-reviewed requirements for the manual, then inserts fresh candidates.
 * APPROVED and REJECTED rows (human-reviewed) are never touched.
 */
export declare function persistManualRequirementExtractions(prisma: PrismaClient, manualId: string, payerId: string, planName: string | null, rawText: string, opts?: {
    useLlm?: boolean;
    reviewOnly?: boolean;
}): Promise<{
    created: number;
    candidates: number;
}>;
//# sourceMappingURL=manualRequirementExtraction.service.d.ts.map