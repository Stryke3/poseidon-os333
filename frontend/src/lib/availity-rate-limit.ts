/** Sliding window rate limit for Availity proxy routes (per client IP). */
const WINDOW_MS = 60_000
const MAX_REQUESTS = 30
const hits = new Map<string, number[]>()

export function consumeAvailityRateLimit(clientKey: string): boolean {
  const now = Date.now()
  const recent = (hits.get(clientKey) || []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_REQUESTS) {
    hits.set(clientKey, recent)
    return false
  }
  recent.push(now)
  hits.set(clientKey, recent)
  return true
}

export function clientKeyFromRequest(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}
