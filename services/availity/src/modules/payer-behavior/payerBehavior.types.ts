/** No clinical facts are invented — scores use caller-supplied flags, DB rules, and stored outcomes only. */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type OutcomeResult = "APPROVED" | "DENIED" | "PENDED" | "UNKNOWN";

/** Request payload for scoring a case (API / services). Optional fields narrow history and rule scope. */
export type ScoreCaseInput = {
  caseId?: string;
  payerId: string;
  planName?: string;
  deviceCategory?: string;
  hcpcsCode?: string;
  diagnosisCode?: string;
  physicianName?: string;
  facilityName?: string;
  hasLmn: boolean;
  hasSwo: boolean;
  hasClinicals: boolean;
};

export type ScoreCaseExplanationType = "RULE" | "HISTORY";

export type ScoreCaseExplanation = {
  type: ScoreCaseExplanationType;
  message: string;
};

/**
 * Downstream routing after a score (deterministic; same inputs → same flags).
 * Order: missing requirements block submit → HIGH → manual review → SUBMIT → packet path.
 */
export type PayerScoreWorkflow = {
  /** `missingRequirements.length > 0` — do not submit until resolved. */
  blockSubmission: boolean;
  /** `riskLevel === "HIGH"` and not blocked by missing docs — queue for human review. */
  requiresManualReview: boolean;
  /** Safe to continue automated packet submission (only when action is SUBMIT and prior gates pass). */
  allowPacketSubmission: boolean;
};

/** Public score result (API response + persisted snapshot core). */
export type ScoreCaseResult = {
  approvalProbability: number;
  riskLevel: RiskLevel;
  predictedDenialReasons: string[];
  missingRequirements: string[];
  recommendedAction: string;
  explanation: ScoreCaseExplanation[];
  workflow: PayerScoreWorkflow;
};

/** Subset of `PayerRule` used by deterministic scoring. */
export type PayerRuleRecord = {
  id: string;
  payerId: string;
  planName: string | null;
  deviceCategory: string | null;
  hcpcsCode: string | null;
  diagnosisCode: string | null;
  requiresLmn: boolean;
  requiresSwo: boolean;
  requiresClinicals: boolean;
  requiresAuth: boolean;
  notes: string | null;
  active: boolean;
};

/** Normalized input for rule matching + history scope (diagnosis list built from `diagnosisCode` / arrays). */
export type ScoreComputationInput = {
  payerId: string;
  planName?: string;
  deviceCategory?: string;
  hcpcsCode?: string;
  diagnosisCodes: string[];
  hasLmn: boolean;
  hasSwo: boolean;
  hasClinicals: boolean;
};

/** Full output of the deterministic engine (public score + audit-only fields). */
export type DeterministicScoreOutput = {
  score: ScoreCaseResult;
  blockSubmission: boolean;
  confidenceNote: string | null;
};

/** Matched payer rules passed into {@link applyPayerBehaviorRules} (scope already applied). */
export type PayerBehaviorMatchedRule = {
  payerId: string;
  planName?: string | null;
  deviceCategory?: string | null;
  hcpcsCode?: string | null;
  diagnosisCode?: string | null;
  requiresLmn: boolean;
  requiresSwo: boolean;
  requiresClinicals: boolean;
  requiresAuth: boolean;
  notes?: string | null;
};

/** Aggregates derived from stored outcomes for scoring. */
export type PayerBehaviorStats = {
  total: number;
  approved: number;
  denied: number;
  approvalRate: number;
  topDenialReasons: string[];
};
