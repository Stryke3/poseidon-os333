"use strict";
/**
 * Availity API endpoint paths.
 *
 * These are configurable via environment variables.  If Availity changes
 * their API surface, update AVAILITY_ELIGIBILITY_PATH / AVAILITY_PRIOR_AUTH_PATH
 * in your .env rather than editing code.
 *
 * Docs (sandbox): https://developer.availity.com/
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REDACTED_HEADERS = exports.AVAILITY_ENDPOINTS = void 0;
const config_js_1 = require("./config.js");
exports.AVAILITY_ENDPOINTS = {
    TOKEN: config_js_1.config.availity.tokenUrl,
    ELIGIBILITY: `${config_js_1.config.availity.baseUrl}${config_js_1.config.availity.eligibilityPath}`,
    /** POST to submit; GET with /{authId} to poll status */
    PRIOR_AUTH: `${config_js_1.config.availity.baseUrl}${config_js_1.config.availity.priorAuthPath}`,
};
/** HTTP headers that must be redacted in any log output */
exports.REDACTED_HEADERS = ["authorization", "x-api-key"];
//# sourceMappingURL=constants.js.map