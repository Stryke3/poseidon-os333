/**
 * POSEIDON LITE — server-side calls to the lite FastAPI service.
 */

export function getLiteBaseUrl(): string {
  const v = process.env.LITE_API_URL?.trim()
  if (v) return v.replace(/\/$/, "")
  return "http://127.0.0.1:8010"
}

export function liteAuthHeaders(): Record<string, string> {
  const key = process.env.INTERNAL_API_KEY?.trim()
  if (!key) return {}
  return { "X-Internal-API-Key": key }
}

export async function liteServerFetch(path: string, init?: RequestInit): Promise<Response> {
  const p = path.startsWith("/") ? path : `/${path}`
  const url = `${getLiteBaseUrl()}${p}`
  const headers = new Headers(init?.headers)
  const auth = liteAuthHeaders()
  for (const [k, v] of Object.entries(auth)) {
    headers.set(k, v)
  }
  return fetch(url, { ...init, headers, cache: "no-store" })
}
