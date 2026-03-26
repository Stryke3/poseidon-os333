import type { AuthorizationOutcome } from "@prisma/client";

/** One correlated playbook scope + raw outcome rows from the evaluation window. */
export type OutcomeScopeGroup = {
  playbookId: string;
  playbookVersion: number;
  payerId: string;
  planName: string | null;
  deviceCategory: string | null;
  hcpcsCode: string | null;
  diagnosisCode: string | null;
  rows: AuthorizationOutcome[];
};

export type LearningEvaluationSummary = {
  performanceRows: number;
  recommendationsCreated: number;
  suggestionsCreated: number;
  periodStart: string;
  periodEnd: string;
};
