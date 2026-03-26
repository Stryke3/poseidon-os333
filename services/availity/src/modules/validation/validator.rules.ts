import type { ManualRequirement, PayerRule } from "@prisma/client";
import type { ValidationInput, ValidationResultType } from "./validator.types.js";

function safeParseJson(input: unknown): unknown | null {
  if (typeof input !== "string") return null;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

function normalizeDocType(type: string): string {
  return String(type ?? "").trim().toUpperCase();
}

function requiredDocTypeFromManualRequirement(req: ManualRequirement): string | null {
  // `requirementKey` is a stable hash, not the doc type. Doc kind is in `requirementValue` JSON.
  const parsed = safeParseJson(req.requirementValue) as Record<string, unknown> | null;
  const kind = typeof parsed?.kind === "string" ? parsed.kind : null;
  const k = kind ? normalizeDocType(kind) : "";

  if (k === "LMN") return "LMN";
  if (k === "ORDER") return "SWO";
  if (k === "CLINICAL_NOTES") return "CLINICAL_SUMMARY";
  return null;
}

export function validateRequirements(
  input: ValidationInput,
  manualRequirements: ManualRequirement[],
  payerRules: PayerRule[],
  playbookResult: any,
): ValidationResultType {
  const missing: string[] = [];
  const violations: string[] = [];
  const warnings: string[] = [];
  const explanation: string[] = [];

  const attachments = input.packet.attachments || [];

  function hasDoc(type: string) {
    const want = normalizeDocType(type);
    return attachments.some((a) => normalizeDocType(a.type) === want);
  }

  // --- Manual Requirements ---
  for (const req of manualRequirements) {
    if (req.requirementType === "REQUIRED_DOCUMENT") {
      const docType = requiredDocTypeFromManualRequirement(req);
      if (docType && !hasDoc(docType)) {
        missing.push(docType);
        explanation.push(
          `Manual requirement: ${docType} required (${req.sourceExcerpt ?? "no excerpt"})`,
        );
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

  if (playbookResult?.modifications?.some((m: unknown) => String(m ?? "").includes("Missing"))) {
    warnings.push("Playbook indicates missing elements");
  }

  const uniqueMissing = [...new Set(missing)];
  const uniqueViolations = [...new Set(violations)];

  let status: "PASS" | "BLOCK" | "REVIEW" = "PASS";

  if (uniqueMissing.length > 0) {
    status = "BLOCK";
  } else if (warnings.length > 0) {
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

