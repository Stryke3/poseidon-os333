/**
 * Availity API endpoint paths.
 *
 * These are configurable via environment variables.  If Availity changes
 * their API surface, update AVAILITY_ELIGIBILITY_PATH / AVAILITY_PRIOR_AUTH_PATH
 * in your .env rather than editing code.
 *
 * Docs (sandbox): https://developer.availity.com/
 */

import { config } from "./config.js";

export const AVAILITY_ENDPOINTS = {
  TOKEN: config.availity.tokenUrl,
  ELIGIBILITY: `${config.availity.baseUrl}${config.availity.eligibilityPath}`,

  /** POST to submit; GET with /{authId} to poll status */
  PRIOR_AUTH: `${config.availity.baseUrl}${config.availity.priorAuthPath}`,
} as const;

/** HTTP headers that must be redacted in any log output */
export const REDACTED_HEADERS = ["authorization", "x-api-key"] as const;
