import type { DeterministicScoreOutput, PayerBehaviorMatchedRule, PayerBehaviorStats, PayerRuleRecord, PayerScoreWorkflow, RiskLevel, ScoreCaseInput, ScoreCaseResult, ScoreComputationInput } from "./payerBehavior.types.js";
export declare const MIN_HISTORY_FOR_CONFIDENCE = 5;
/** Aggregate raw outcomes into histograms (used by stats service + tests). */
export declare function buildDenialHistogram(denialReasons: (string | null)[]): Record<string, number>;
export declare function fullRuleToMatched(r: PayerRuleRecord): PayerBehaviorMatchedRule;
/**
 * Post-score workflow flags for packet / submission orchestration.
 */
export declare function computePayerScoreWorkflow(params: {
    missingRequirements: string[];
    riskLevel: RiskLevel;
    recommendedAction: string;
}): PayerScoreWorkflow;
/** True when optional rule scope dimensions all match the score input (null = wildcard). */
export declare function payerRuleMatchesInput(r: PayerRuleRecord, input: ScoreComputationInput): boolean;
/**
 * Deterministic score from matched rules + history stats (no ML).
 * Caller supplies already-scoped `matchedRules`.
 */
export declare function applyPayerBehaviorRules(input: ScoreCaseInput, matchedRules: PayerBehaviorMatchedRule[], stats: PayerBehaviorStats): ScoreCaseResult;
/**
 * Loads scoped rules from DB rows, applies {@link applyPayerBehaviorRules} with supplied stats.
 */
export declare function computeDeterministicScore(params: {
    input: ScoreComputationInput;
    stats: PayerBehaviorStats;
    rules: PayerRuleRecord[];
}): DeterministicScoreOutput;
//# sourceMappingURL=payerBehavior.rules.d.ts.map