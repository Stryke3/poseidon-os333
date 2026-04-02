/**
 * Server-side base URL for the Availity Node service (Docker: http://availity:8005).
 * Use env only — never `NEXT_PUBLIC_*` (no Availity secrets in the client bundle).
 */
import { getServiceBaseUrl } from "@/lib/runtime-config"

export function availityServiceBaseUrl(): string {
  const explicit = process.env.AVAILITY_SERVICE_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/$/, "")
  }

  // Local Next dev often runs outside Docker and may not have AVAILITY_SERVICE_URL
  // copied into frontend/.env.local yet.
  if ((process.env.NODE_ENV || "development").toLowerCase() !== "production") {
    return "http://127.0.0.1:8005"
  }

  return getServiceBaseUrl("AVAILITY_SERVICE_URL")
}

export const AVAILITY_INTEGRATION_PATH = "/api/integrations/availity"
