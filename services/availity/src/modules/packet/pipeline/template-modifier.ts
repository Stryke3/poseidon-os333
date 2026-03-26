import type { TemplateModifierContext } from "./types.js";

/**
 * Template modifier: may only add non-clinical keys (e.g. mlRoutingNote).
 * Never overwrite diagnosis, history, justification, or other clinical fields from ML output.
 */
export function modifyTemplateVariables(
  ctx: TemplateModifierContext,
): Record<string, string> {
  const mlRoutingNote = buildMlRoutingNote(ctx);

  return {
    ...ctx.baseVariables,
    mlRoutingNote,
  };
}

/** Non-clinical operational line for audit / workflow routing only. */
function buildMlRoutingNote(ctx: TemplateModifierContext): string {
  const { scores, docType } = ctx;
  const parts = [
    `[${docType}] model=${scores.modelVersion}`,
    `risk=${scores.riskBand}`,
  ];
  if (scores.complexityScore != null) {
    parts.push(`complexity=${scores.complexityScore.toFixed(2)}`);
  }
  return parts.join(" ");
}
