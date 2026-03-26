/**
 * Small server-side fetch wrapper used by Next.js API proxy routes.
 * Keeps request options consistent (no-store) and ensures plain header passthrough.
 */
export async function serverFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    cache: init?.cache ?? "no-store",
  })
}

