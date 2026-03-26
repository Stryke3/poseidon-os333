/**
 * Small fetch wrapper for outbound HTTP (Node 18+ global fetch).
 * Centralizes timeouts; Availity service does not add a separate HTTP dependency.
 */
export declare function httpRequest(url: string, init: RequestInit, timeoutMs: number): Promise<Response>;
//# sourceMappingURL=http.d.ts.map