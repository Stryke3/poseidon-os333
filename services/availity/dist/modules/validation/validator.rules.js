"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequirements = validateRequirements;
function safeParseJson(input) {
    if (typeof input !== "string")
        return null;
    try {
        return JSON.parse(input);
    }
    catch {
        return null;
    }
}
function normalizeDocType(type) {
    return String(type ?? "").trim().toUpperCase();
}
function requiredDocTypeFromManualRequirement(req) {
    // `requirementKey` is a stable hash, not the doc type. Doc kind is in `requirementValue` JSON.
    const parsed = safeParseJson(req.requirementValue);
    const kind = typeof parsed?.kind === "string" ? parsed.kind : null;
    const k = kind ? normalizeDocType(kind) : "";
    if (k === "LMN")
        return "LMN";
    if (k === "ORDER")
        return "SWO";
    if (k === "CLINICAL_NOTES")
        return "CLINICAL_SUMMARY";
    return null;
}
function validateRequirements(input, manualRequirements, payerRules, playbookResult) {
    const missing = [];
    const violations = [];
    const warnings = [];
    const explanation = [];
    const attachments = input.packet.attachments || [];
    function hasDoc(type) {
        const want = normalizeDocType(type);
        return attachments.some((a) => normalizeDocType(a.type) === want);
    }
    // --- Manual Requirements ---
    for (const req of manualRequirements) {
        if (req.requirementType === "REQUIRED_DOCUMENT") {
            const docType = requiredDocTypeFromManualRequirement(req);
            if (docType && !hasDoc(docType)) {
                missing.push(docType);
                explanation.push(`Manual requirement: ${docType} required (${req.sourceExcerpt ?? "no excerpt"})`);
            }
        }
        if (req.requirementType === "TIMING_RULE") {
            warnings.push(`Timing rule detected: ${req.requirementValue}`);
            explanation.push(`Timing constraint from manual: ${req.sourceExcerpt ?? "no excerpt"}`);
        }
    }
    // --- Payer Rules ---
    for (const rule of payerRules) {
        if (rule.requiresLmn && !hasDoc("LMN")) {
            missing.push("LMN");
            explanation.push("Payer rule requires LMN");
        }
        if (rule.requiresSwo && !hasDoc("SWO")) {
            missing.push("SWO");
            explanation.push("Payer rule requires SWO");
        }
        // In this repo, clinical doc type is `CLINICAL_SUMMARY`.
        if (rule.requiresClinicals && !hasDoc("CLINICAL_SUMMARY")) {
            missing.push("CLINICAL_SUMMARY");
            explanation.push("Payer rule requires clinical documentation");
        }
    }
    // --- Playbook Enforcement ---
    if (playbookResult?.modifications?.length) {
        explanation.push("Playbook modifications applied");
    }
    if (playbookResult?.modifications?.some((m) => String(m ?? "").includes("Missing"))) {
        warnings.push("Playbook indicates missing elements");
    }
    const uniqueMissing = [...new Set(missing)];
    const uniqueViolations = [...new Set(violations)];
    let status = "PASS";
    if (uniqueMissing.length > 0) {
        status = "BLOCK";
    }
    else if (warnings.length > 0) {
        status = "REVIEW";
    }
    return {
        status,
        missingRequirements: uniqueMissing,
        violations: uniqueViolations,
        warnings,
        recommendedActions: uniqueMissing.map((m) => `Add required document: ${m}`),
        explanation,
    };
}
//# sourceMappingURL=validator.rules.js.map