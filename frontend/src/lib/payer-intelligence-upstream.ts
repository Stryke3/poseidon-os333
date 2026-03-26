import { availityServiceBaseUrl } from "@/lib/availity-upstream"

/** Payer Behavior Engine is served by the same Availity Node service. */
export const PAYER_INTELLIGENCE_PATH = "/api/intelligence/payer"

export function payerIntelligenceBaseUrl(): string {
  return `${availityServiceBaseUrl()}${PAYER_INTELLIGENCE_PATH}`
}
