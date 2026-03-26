/**
 * Availity API endpoint paths.
 *
 * These are configurable via environment variables.  If Availity changes
 * their API surface, update AVAILITY_ELIGIBILITY_PATH / AVAILITY_PRIOR_AUTH_PATH
 * in your .env rather than editing code.
 *
 * Docs (sandbox): https://developer.availity.com/
 */
export declare const AVAILITY_ENDPOINTS: {
    readonly TOKEN: string;
    readonly ELIGIBILITY: string;
    /** POST to submit; GET with /{authId} to poll status */
    readonly PRIOR_AUTH: string;
};
/** HTTP headers that must be redacted in any log output */
export declare const REDACTED_HEADERS: readonly ["authorization", "x-api-key"];
//# sourceMappingURL=constants.d.ts.map