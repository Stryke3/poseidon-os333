/**
 * Transform raw Availity eligibility response into a stable internal shape.
 *
 * Availity's 270/271 eligibility response structure varies by payer.
 * This normalizer extracts the most commonly available fields and
 * falls back gracefully when data is missing.
 */

import type { NormalizedEligibilityResponse } from "../types/availity.js";

export type { NormalizedEligibilityResponse };

/** @deprecated Use NormalizedEligibilityResponse */
export type NormalizedEligibility = NormalizedEligibilityResponse;

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "");
    if (cleaned === "" || cleaned === "." || cleaned === "-" || cleaned === "-.") {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function strOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

function resolveCoverageActive(e: Record<string, any>): boolean | null {
  if (typeof e.coverageActive === "boolean") return e.coverageActive;
  const status = String(e.coverageStatus ?? e.status ?? "").toLowerCase();
  if (!status) return null;
  if (status === "active" || status === "1") return true;
  if (
    status === "inactive" ||
    status === "0" ||
    status === "terminated" ||
    status === "cancelled"
  ) {
    return false;
  }
  return null;
}

function resolveBooleanish(direct: unknown, fallbackSource: Record<string, any>): boolean | null {
  if (typeof direct === "boolean") return direct;
  if (direct === null || direct === undefined) {
    return resolveCoverageActive(fallbackSource);
  }
  return resolveCoverageActive(fallbackSource);
}

function authBoolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/**
 * Normalize a single eligibility-like object (often after unwrapping API envelopes).
 */
export function normalizeEligibilityResponse(raw: any): NormalizedEligibilityResponse {
  const coverageActive = resolveBooleanish(
    raw?.coverageActive ?? raw?.coverage?.active ?? raw?.active,
    raw,
  );

  return {
    success: true,
    coverageActive,
    payerName: strOrNull(
      raw?.payerName ??
        raw?.payer?.name ??
        raw?.healthPlan?.name ??
        null,
    ),
    memberId: strOrNull(
      raw?.memberId ??
        raw?.subscriber?.memberId ??
        raw?.subscriberId ??
        raw?.member?.id ??
        null,
    ),
    planName: strOrNull(
      raw?.planName ??
        raw?.plan?.name ??
        raw?.coverage?.planName ??
        raw?.insurancePlanName ??
        null,
    ),
    deductible: asNumber(
      raw?.deductible ??
        raw?.deductibleAmount ??
        raw?.benefits?.deductible,
    ),
    deductibleRemaining: asNumber(
      raw?.deductibleRemaining ??
        raw?.remainingDeductible ??
        raw?.benefits?.deductibleRemaining,
    ),
    authRequired:
      authBoolOrNull(raw?.authRequired) ??
      authBoolOrNull(raw?.priorAuthorizationRequired) ??
      authBoolOrNull(raw?.coverage?.authRequired) ??
      authBoolOrNull(raw?.authorizationRequired),
    rawResponse: raw,
  };
}

function emptyResult(
  success: boolean,
  raw: unknown,
): NormalizedEligibilityResponse {
  return {
    success,
    coverageActive: null,
    payerName: null,
    memberId: null,
    planName: null,
    deductible: null,
    deductibleRemaining: null,
    authRequired: null,
    rawResponse: raw,
  };
}

/** Full API response: unwrap common envelopes, then normalize. */
export function normalizeEligibility(
  raw: unknown,
): NormalizedEligibilityResponse {
  if (!raw || typeof raw !== "object") {
    return emptyResult(false, raw);
  }

  const r = raw as Record<string, any>;
  const inner = r.eligibility ?? r.coverages?.[0] ?? r.benefit ?? r;

  const normalized = normalizeEligibilityResponse(inner);
  return { ...normalized, rawResponse: raw };
}
