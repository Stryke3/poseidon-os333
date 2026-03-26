/**
 * Simple `{{key}}` substitution. Keys may contain dots (e.g. `clinical.physician.npi`);
 * they are escaped for RegExp so `.` is literal, not a wildcard.
 */
/** Collect `{{ ... }}` keys as written in the template (trimmed). */
export declare function templatePlaceholderKeys(template: string): string[];
/**
 * Flatten a nested object tree into dotted keys with string values.
 * `null` / `undefined` leaves become `""`. Arrays are JSON-stringified.
 */
export declare function flattenTemplateVariables(source: Record<string, unknown>, prefix?: string): Record<string, string>;
/** Merge: every placeholder key in the template gets a value (missing → ""). */
export declare function variablesForTemplate(template: string, source: Record<string, unknown>): Record<string, string>;
export declare function renderTemplate(template: string, variables: Record<string, string>): string;
/** Provenance map: each placeholder key in the template maps to itself (traceability). */
export declare function provenanceForTemplate(template: string): Record<string, string>;
//# sourceMappingURL=template-engine.d.ts.map