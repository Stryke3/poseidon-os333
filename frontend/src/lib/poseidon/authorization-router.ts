import { randomUUID } from "node:crypto";
import type { SpearCase } from "@/lib/poseidon-store";
import type { AuthorizationDecision, EligibilityCheck } from "@/lib/clearinghouse/types";

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function routeAuthorization(caseRecord: SpearCase): AuthorizationDecision {
  const now = new Date().toISOString();
  const eligibility = list<EligibilityCheck>(caseRecord.eligibility_checks)[0];
  const payer = String(caseRecord.payer || "").toLowerCase();
  const commercial = !payer.includes("medicare") && !payer.includes("medicaid");
  const indicator = eligibility?.authorizationIndicator;
  const required = indicator === "REQUIRED" ? true : indicator === "NOT_REQUIRED" ? false : commercial ? "UNKNOWN" : false;
  const status = required === false ? "NOT_REQUIRED" : required === true ? "REQUIRED" : "UNKNOWN";
  const route = required === false ? "NO_AUTH_REQUIRED" : payer.includes("aetna") || payer.includes("united") || payer.includes("cigna") ? "PAYER_PORTAL" : "MANUAL_REVIEW";
  return {
    id: `auth_${randomUUID()}`,
    caseId: caseRecord.id,
    required,
    route,
    status,
    evidence: [
      { source: "eligibility", status: eligibility?.status || "not_checked", authorizationIndicator: indicator || "UNKNOWN" },
      { source: "trident", note: "Trident owns authorization decision layer; unsupported electronic PA routes stay manual/portal/fax." },
    ],
    humanReviewRequired: required !== false,
    createdAt: now,
    updatedAt: now,
  };
}
