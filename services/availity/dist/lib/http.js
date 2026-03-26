"use strict";
/**
 * Small fetch wrapper for outbound HTTP (Node 18+ global fetch).
 * Centralizes timeouts; Availity service does not add a separate HTTP dependency.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpRequest = httpRequest;
async function httpRequest(url, init, timeoutMs) {
    return fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
    });
}
//# sourceMappingURL=http.js.map