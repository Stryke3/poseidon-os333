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
  const signal = init?.signal || (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(1200) : undefined)
  for (const [k, v] of Object.entries(auth)) {
    headers.set(k, v)
  }
  try {
    return await fetch(url, { ...init, headers, cache: "no-store", signal })
  } catch (error) {
    console.warn(`[lite-api] request failed for ${url}`, error)
    return new Response(null, {
      status: 503,
      statusText: "Lite service unavailable",
    })
  }
}
