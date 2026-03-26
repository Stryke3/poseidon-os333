import type { TemplateModifierContext } from "./types.js";
/**
 * Template modifier: may only add non-clinical keys (e.g. mlRoutingNote).
 * Never overwrite diagnosis, history, justification, or other clinical fields from ML output.
 */
export declare function modifyTemplateVariables(ctx: TemplateModifierContext): Record<string, string>;
//# sourceMappingURL=template-modifier.d.ts.map