/**
 * Simple `{{key}}` substitution. Keys may contain dots (e.g. `clinical.physician.npi`);
 * they are escaped for RegExp so `.` is literal, not a wildcard.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Collect `{{ ... }}` keys as written in the template (trimmed). */
export function templatePlaceholderKeys(template: string): string[] {
  const keys: string[] = [];
  const re = /\{\{([^}]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    keys.push(m[1].trim());
  }
  return keys;
}

/**
 * Flatten a nested object tree into dotted keys with string values.
 * `null` / `undefined` leaves become `""`. Arrays are JSON-stringified.
 */
export function flattenTemplateVariables(
  source: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(
        out,
        flattenTemplateVariables(v as Record<string, unknown>, path),
      );
    } else if (Array.isArray(v)) {
      out[path] = JSON.stringify(v);
    } else {
      out[path] = v === null || v === undefined ? "" : String(v);
    }
  }
  return out;
}

/** Merge: every placeholder key in the template gets a value (missing → ""). */
export function variablesForTemplate(
  template: string,
  source: Record<string, unknown>,
): Record<string, string> {
  const base = flattenTemplateVariables(source);
  const vars: Record<string, string> = { ...base };
  for (const key of templatePlaceholderKeys(template)) {
    if (vars[key] === undefined) {
      vars[key] = "";
    }
  }
  return vars;
}

export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  let output = template;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${escapeRegExp(key)}}}`, "g");
    output = output.replace(regex, () => value ?? "");
  }

  return output;
}

/** Provenance map: each placeholder key in the template maps to itself (traceability). */
export function provenanceForTemplate(template: string): Record<string, string> {
  return Object.fromEntries(
    templatePlaceholderKeys(template).map((k) => [k, k]),
  );
}
