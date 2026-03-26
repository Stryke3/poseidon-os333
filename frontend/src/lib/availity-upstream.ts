/**
 * Server-side base URL for the Availity Node service (Docker: http://availity:8005).
 * Use env only — never `NEXT_PUBLIC_*` (no Availity secrets in the client bundle).
 */
export function availityServiceBaseUrl(): string {
  const raw = process.env.AVAILITY_SERVICE_URL?.trim()
  if (raw) return raw.replace(/\/$/, "")
  return "http://127.0.0.1:8005"
}

export const AVAILITY_INTEGRATION_PATH = "/api/integrations/availity"
