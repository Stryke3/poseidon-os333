/**
 * Small fetch wrapper for outbound HTTP (Node 18+ global fetch).
 * Centralizes timeouts; Availity service does not add a separate HTTP dependency.
 */

export async function httpRequest(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}
