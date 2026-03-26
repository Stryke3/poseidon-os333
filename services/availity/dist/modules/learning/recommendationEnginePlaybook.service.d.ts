import type { GovernanceRecommendation, LearnedRuleSuggestion, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
export type RuleSuggestionFromOutcomesInput = {
    payerId: string;
    pattern: {
        planName?: string;
        deviceCategory?: string;
        hcpcsCode?: string;
        diagnosisCode?: string;
    };
    repeatedDenialReason: string;
    evidence: Prisma.InputJsonValue;
};
/**
 * Playbook-scoped recommendation helpers driven by latest `PlaybookPerformance` snapshot.
 * Uses the same PENDING dedupe semantics as the batch learning evaluator.
 */
export declare class RecommendationEngineService {
    private readonly db;
    constructor(db: PrismaClient);
    /**
     * Evaluates the most recent performance row for `(playbookId, version)` and may open
     * a single governance recommendation. Returns null if sample is too small or no rule fires.
     */
    evaluatePlaybook(playbookId: string, version: number): Promise<GovernanceRecommendation | null>;
    createRuleSuggestionFromOutcomes(input: RuleSuggestionFromOutcomesInput): Promise<LearnedRuleSuggestion>;
}
export declare const recommendationEngineService: RecommendationEngineService;
//# sourceMappingURL=recommendationEnginePlaybook.service.d.ts.map