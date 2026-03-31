/**
 * Server-side base URL for the Availity Node service (Docker: http://availity:8005).
 * Use env only — never `NEXT_PUBLIC_*` (no Availity secrets in the client bundle).
 */
import { getServiceBaseUrl } from "@/lib/runtime-config"

export function availityServiceBaseUrl(): string {
  return getServiceBaseUrl("AVAILITY_SERVICE_URL")
}

export const AVAILITY_INTEGRATION_PATH = "/api/integrations/availity"
