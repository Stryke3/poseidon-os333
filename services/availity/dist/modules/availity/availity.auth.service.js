"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.availityAuthService = exports.AvailityAuthService = void 0;
exports.getAccessToken = getAccessToken;
exports.clearTokenCache = clearTokenCache;
exports._setCachedToken = _setCachedToken;
exports._getCachedToken = _getCachedToken;
const config_js_1 = require("../../config.js");
const http_js_1 = require("../../lib/http.js");
const errors_js_1 = require("../../lib/errors.js");
const audit_js_1 = require("../../lib/audit.js");
const logger_js_1 = require("../../lib/logger.js");
const REFRESH_BUFFER_MS = 60_000;
let cachedToken = null;
function isTokenValid(token) {
    if (!token)
        return false;
    return Date.now() < token.expiresAtEpochMs - REFRESH_BUFFER_MS;
}
/**
 * OAuth2 client-credentials for Availity. Tokens stay in memory only — never written to Prisma/audit.
 */
class AvailityAuthService {
    async getAccessToken(forceRefresh = false) {
        if (!forceRefresh && isTokenValid(cachedToken)) {
            return cachedToken.accessToken;
        }
        const body = new URLSearchParams({
            grant_type: "client_credentials",
            client_id: config_js_1.availityConfig.clientId,
            client_secret: config_js_1.availityConfig.clientSecret,
            scope: config_js_1.availityConfig.scope,
        });
        let response;
        try {
            response = await (0, http_js_1.httpRequest)(config_js_1.availityConfig.tokenUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                },
                body: body.toString(),
            }, config_js_1.availityConfig.timeoutMs);
        }
        catch (err) {
            const e = err;
            if (e?.name === "TimeoutError" || e?.name === "AbortError") {
                throw new errors_js_1.AvailityTimeoutError(config_js_1.availityConfig.tokenUrl);
            }
            throw err;
        }
        const rawText = await response.text();
        let parsed;
        try {
            parsed = rawText ? JSON.parse(rawText) : {};
        }
        catch {
            parsed = { rawText };
        }
        if (!response.ok) {
            logger_js_1.logger.error({ status: response.status, body: (0, audit_js_1.redactSensitiveFields)(parsed) }, "Availity token request failed");
            throw new errors_js_1.AvailityAuthError("Availity token request failed", {
                status: response.status,
                body: parsed,
            });
        }
        const tokenResponse = parsed;
        if (!tokenResponse.access_token || !tokenResponse.expires_in) {
            throw new errors_js_1.AvailityAuthError("Invalid token payload returned from Availity", {
                body: parsed,
            });
        }
        cachedToken = {
            accessToken: tokenResponse.access_token,
            expiresAtEpochMs: Date.now() + tokenResponse.expires_in * 1000,
        };
        logger_js_1.logger.info({ expiresInSec: tokenResponse.expires_in }, "Availity access token acquired");
        return cachedToken.accessToken;
    }
    async healthCheck() {
        await this.getAccessToken();
        return { ok: true, tokenAcquired: true };
    }
}
exports.AvailityAuthService = AvailityAuthService;
exports.availityAuthService = new AvailityAuthService();
async function getAccessToken() {
    return exports.availityAuthService.getAccessToken();
}
function clearTokenCache() {
    cachedToken = null;
}
/** @internal Tests only */
function _setCachedToken(token) {
    cachedToken = token;
}
/** @internal Tests only */
function _getCachedToken() {
    return cachedToken;
}
//# sourceMappingURL=availity.auth.service.js.map