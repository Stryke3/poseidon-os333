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
export declare function asNumber(value: unknown): number | null;
/**
 * Normalize a single eligibility-like object (often after unwrapping API envelopes).
 */
export declare function normalizeEligibilityResponse(raw: any): NormalizedEligibilityResponse;
/** Full API response: unwrap common envelopes, then normalize. */
export declare function normalizeEligibility(raw: unknown): NormalizedEligibilityResponse;
//# sourceMappingURL=eligibility.d.ts.map