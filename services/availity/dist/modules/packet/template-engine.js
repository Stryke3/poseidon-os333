"use strict";
/**
 * Simple `{{key}}` substitution. Keys may contain dots (e.g. `clinical.physician.npi`);
 * they are escaped for RegExp so `.` is literal, not a wildcard.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.templatePlaceholderKeys = templatePlaceholderKeys;
exports.flattenTemplateVariables = flattenTemplateVariables;
exports.variablesForTemplate = variablesForTemplate;
exports.renderTemplate = renderTemplate;
exports.provenanceForTemplate = provenanceForTemplate;
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** Collect `{{ ... }}` keys as written in the template (trimmed). */
function templatePlaceholderKeys(template) {
    const keys = [];
    const re = /\{\{([^}]+)\}\}/g;
    let m;
    while ((m = re.exec(template)) !== null) {
        keys.push(m[1].trim());
    }
    return keys;
}
/**
 * Flatten a nested object tree into dotted keys with string values.
 * `null` / `undefined` leaves become `""`. Arrays are JSON-stringified.
 */
function flattenTemplateVariables(source, prefix = "") {
    const out = {};
    for (const [k, v] of Object.entries(source)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
            Object.assign(out, flattenTemplateVariables(v, path));
        }
        else if (Array.isArray(v)) {
            out[path] = JSON.stringify(v);
        }
        else {
            out[path] = v === null || v === undefined ? "" : String(v);
        }
    }
    return out;
}
/** Merge: every placeholder key in the template gets a value (missing → ""). */
function variablesForTemplate(template, source) {
    const base = flattenTemplateVariables(source);
    const vars = { ...base };
    for (const key of templatePlaceholderKeys(template)) {
        if (vars[key] === undefined) {
            vars[key] = "";
        }
    }
    return vars;
}
function renderTemplate(template, variables) {
    let output = template;
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{${escapeRegExp(key)}}}`, "g");
        output = output.replace(regex, () => value ?? "");
    }
    return output;
}
/** Provenance map: each placeholder key in the template maps to itself (traceability). */
function provenanceForTemplate(template) {
    return Object.fromEntries(templatePlaceholderKeys(template).map((k) => [k, k]));
}
//# sourceMappingURL=template-engine.js.map