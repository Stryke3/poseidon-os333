import type { DocumentGeneratorInput } from "../../../schemas/packet.js";

export type PriorAuthDocType = "LMN" | "SWO";

/**
 * Output of the ML scoring stage. Must not introduce clinical facts — only scores,
 * bands, or routing hints derived from policy/model configuration.
 * TODO: Map fields to your production model contract and governance review.
 */
export type MlScoreResult = {
  /** Opaque model / ruleset version for audit. */
  modelVersion: string;
  /** Routing / review intensity — not a clinical diagnosis. */
  riskBand: "low" | "medium" | "high";
  /** Optional normalized complexity in [0, 1] for rules. */
  complexityScore?: number;
};

export type TemplateModifierContext = {
  docType: PriorAuthDocType;
  input: DocumentGeneratorInput;
  scores: MlScoreResult;
  baseVariables: Record<string, string>;
};

export type DocumentPipelineResult = {
  variables: Record<string, string>;
  scores: MlScoreResult;
};
