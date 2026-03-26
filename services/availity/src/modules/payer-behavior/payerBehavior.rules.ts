import type {
  DeterministicScoreOutput,
  PayerBehaviorMatchedRule,
  PayerBehaviorStats,
  PayerRuleRecord,
  PayerScoreWorkflow,
  RiskLevel,
  ScoreCaseExplanation,
  ScoreCaseInput,
  ScoreCaseResult,
  ScoreComputationInput,
} from "./payerBehavior.types.js";

export const MIN_HISTORY_FOR_CONFIDENCE = 5;

function normalizeDenialKey(reason: string): string {
  return reason.trim().slice(0, 200) || "unspecified";
}

/** Aggregate raw outcomes into histograms (used by stats service + tests). */
export function buildDenialHistogram(
  denialReasons: (string | null)[],
): Record<string, number> {
  const h: Record<string, number> = {};
  for (const r of denialReasons) {
    if (!r) continue;
    const k = normalizeDenialKey(r);
    h[k] = (h[k] ?? 0) + 1;
  }
  return h;
}

function scoreComputationToCaseInput(input: ScoreComputationInput): ScoreCaseInput {
  return {
    payerId: input.payerId,
    planName: input.planName,
    deviceCategory: input.deviceCategory,
    hcpcsCode: input.hcpcsCode,
    diagnosisCode: input.diagnosisCodes[0],
    hasLmn: input.hasLmn,
    hasSwo: input.hasSwo,
    hasClinicals: input.hasClinicals,
  };
}

export function fullRuleToMatched(r: PayerRuleRecord): PayerBehaviorMatchedRule {
  return {
    payerId: r.payerId,
    planName: r.planName,
    deviceCategory: r.deviceCategory,
    hcpcsCode: r.hcpcsCode,
    diagnosisCode: r.diagnosisCode,
    requiresLmn: r.requiresLmn,
    requiresSwo: r.requiresSwo,
    requiresClinicals: r.requiresClinicals,
    requiresAuth: r.requiresAuth,
    notes: r.notes,
  };
}

/**
 * Post-score workflow flags for packet / submission orchestration.
 */
export function computePayerScoreWorkflow(params: {
  missingRequirements: string[];
  riskLevel: RiskLevel;
  recommendedAction: string;
}): PayerScoreWorkflow {
  const blockSubmission = params.missingRequirements.length > 0;
  const requiresManualReview = !blockSubmission && params.riskLevel === "HIGH";
  const allowPacketSubmission =
    !blockSubmission &&
    !requiresManualReview &&
    params.recommendedAction === "SUBMIT";
  return { blockSubmission, requiresManualReview, allowPacketSubmission };
}

/** True when optional rule scope dimensions all match the score input (null = wildcard). */
export function payerRuleMatchesInput(
  r: PayerRuleRecord,
  input: ScoreComputationInput,
): boolean {
  if (r.planName?.trim()) {
    const want = r.planName.trim().toLowerCase();
    const got = input.planName?.trim().toLowerCase();
    if (!got || got !== want) return false;
  }
  if (r.deviceCategory?.trim()) {
    const needle = r.deviceCategory.trim().toLowerCase();
    const hay = (input.deviceCategory ?? "").trim().toLowerCase();
    if (!hay || (!hay.includes(needle) && hay !== needle)) return false;
  }
  if (r.hcpcsCode?.trim()) {
    const want = r.hcpcsCode.trim().toUpperCase();
    const got = input.hcpcsCode?.trim().toUpperCase();
    if (!got || got !== want) return false;
  }
  if (r.diagnosisCode?.trim()) {
    const prefix = r.diagnosisCode.trim().toUpperCase();
    const hit = input.diagnosisCodes.some(
      (d) =>
        d.trim().toUpperCase() === prefix ||
        d.trim().toUpperCase().startsWith(prefix),
    );
    if (!hit) return false;
  }
  return true;
}

/**
 * Deterministic score from matched rules + history stats (no ML).
 * Caller supplies already-scoped `matchedRules`.
 */
export function applyPayerBehaviorRules(
  input: ScoreCaseInput,
  matchedRules: PayerBehaviorMatchedRule[],
  stats: PayerBehaviorStats,
): ScoreCaseResult {
  let score = 75;
  const predictedDenialReasons: string[] = [];
  const missingRequirements: string[] = [];
  const explanation: ScoreCaseExplanation[] = [];

  for (const rule of matchedRules) {
    if (rule.requiresLmn && !input.hasLmn) {
      score -= 20;
      missingRequirements.push("LMN");
      predictedDenialReasons.push("Missing LMN");
      explanation.push({ type: "RULE", message: "Matched payer rule requires LMN." });
    }

    if (rule.requiresSwo && !input.hasSwo) {
      score -= 20;
      missingRequirements.push("SWO");
      predictedDenialReasons.push("Missing SWO");
      explanation.push({ type: "RULE", message: "Matched payer rule requires SWO." });
    }

    if (rule.requiresClinicals && !input.hasClinicals) {
      score -= 15;
      missingRequirements.push("Clinical documentation");
      predictedDenialReasons.push("Insufficient clinical documentation");
      explanation.push({
        type: "RULE",
        message: "Matched payer rule requires supporting clinical documentation.",
      });
    }
  }

  if (stats.total >= MIN_HISTORY_FOR_CONFIDENCE) {
    if (stats.approvalRate < 0.5) {
      score -= 20;
      explanation.push({
        type: "HISTORY",
        message: `Historical approval rate is low (${Math.round(stats.approvalRate * 100)}%).`,
      });
    } else if (stats.approvalRate >= 0.8) {
      score += 10;
      explanation.push({
        type: "HISTORY",
        message: `Historical approval rate is strong (${Math.round(stats.approvalRate * 100)}%).`,
      });
    }

    predictedDenialReasons.push(...stats.topDenialReasons.slice(0, 3));
  } else {
    score -= 10;
    explanation.push({
      type: "HISTORY",
      message: "Limited payer history for this pattern; confidence is lower.",
    });
  }

  score = Math.max(0, Math.min(100, score));

  const uniqueMissing = [...new Set(missingRequirements)];
  const uniqueReasons = [...new Set(predictedDenialReasons)];

  let riskLevel: ScoreCaseResult["riskLevel"] = "LOW";
  if (score < 50) riskLevel = "HIGH";
  else if (score < 75) riskLevel = "MEDIUM";

  let recommendedAction = "SUBMIT";
  if (uniqueMissing.length > 0) {
    recommendedAction = "HOLD_AND_COMPLETE_REQUIREMENTS";
  } else if (riskLevel === "HIGH") {
    recommendedAction = "REVIEW_BEFORE_SUBMISSION";
  }

  const workflow = computePayerScoreWorkflow({
    missingRequirements: uniqueMissing,
    riskLevel,
    recommendedAction,
  });

  return {
    approvalProbability: score,
    riskLevel,
    predictedDenialReasons: uniqueReasons,
    missingRequirements: uniqueMissing,
    recommendedAction,
    explanation,
    workflow,
  };
}

/**
 * Loads scoped rules from DB rows, applies {@link applyPayerBehaviorRules} with supplied stats.
 */
export function computeDeterministicScore(params: {
  input: ScoreComputationInput;
  stats: PayerBehaviorStats;
  rules: PayerRuleRecord[];
}): DeterministicScoreOutput {
  const { input, stats, rules } = params;
  const scoped = rules.filter((x) => x.active && payerRuleMatchesInput(x, input));
  const matchedRules = scoped.map(fullRuleToMatched);
  const scoreCaseInput = scoreComputationToCaseInput(input);
  const score = applyPayerBehaviorRules(scoreCaseInput, matchedRules, stats);
  const blockSubmission = score.workflow.blockSubmission;
  const confidenceNote =
    stats.total < MIN_HISTORY_FOR_CONFIDENCE
      ? "Limited payer history for this pattern; confidence is lower."
      : null;
  return { score, blockSubmission, confidenceNote };
}
