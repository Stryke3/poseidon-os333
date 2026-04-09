import { randomUUID } from "crypto"

import { getRequiredEnv } from "@/lib/runtime-config"

/** Server-side only: forwards or generates X-Correlation-ID for upstream tracing. */
export function correlationHeaders(incoming: Headers): Record<string, string> {
  const existing = incoming.get("x-correlation-id")?.trim()
  return { "X-Correlation-ID": existing || randomUUID() }
}

/** Server-side only: shared secret for Intake and other internal APIs. */
export function internalApiKeyHeaders(): Record<string, string> {
  return { "X-Internal-API-Key": getRequiredEnv("INTERNAL_API_KEY") }
}
