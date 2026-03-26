import type { Prisma, PrismaClient } from "@prisma/client";
import type { LearningEvaluationSummary } from "./learning.types.js";
export declare function pendingDuplicateRecommendation(prisma: PrismaClient, input: {
    recommendationType: string;
    payerId: string;
    targetId: string | null;
    draftPayload: Prisma.JsonValue;
}): Promise<boolean>;
/**
 * Recomputes `PlaybookPerformance` for the window and opens governed recommendations (no prod mutations).
 */
export declare function runLearningEvaluation(prisma: PrismaClient, params: {
    periodDays: number;
    payerId?: string;
    actor: string;
}): Promise<LearningEvaluationSummary>;
export declare class RecommendationEngineService {
    private readonly db;
    constructor(db?: PrismaClient);
    /**
     * Evaluates a playbook performance snapshot and creates a governance recommendation (queue item only).
     * Returns `null` when thresholds aren't met.
     */
    evaluatePlaybook(playbookId: string, version: number): Promise<{
        payerId: string;
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        recommendationType: string;
        targetId: string | null;
        targetType: string | null;
        draftPayload: Prisma.JsonValue;
        evidence: Prisma.JsonValue;
        rationale: string;
    } | null>;
    createRuleSuggestionFromOutcomes(input: {
        payerId: string;
        pattern: {
            planName?: string;
            deviceCategory?: string;
            hcpcsCode?: string;
            diagnosisCode?: string;
        };
        repeatedDenialReason: string;
        evidence: unknown;
    }): Promise<{
        id: string;
    } | null>;
}
export declare const recommendationEngineService: RecommendationEngineService;
//# sourceMappingURL=recommendationEngine.service.d.ts.map