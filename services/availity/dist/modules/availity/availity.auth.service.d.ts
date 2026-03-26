import type { CachedToken } from "../../types/availity.js";
/**
 * OAuth2 client-credentials for Availity. Tokens stay in memory only — never written to Prisma/audit.
 */
export declare class AvailityAuthService {
    getAccessToken(forceRefresh?: boolean): Promise<string>;
    healthCheck(): Promise<{
        ok: true;
        tokenAcquired: true;
    }>;
}
export declare const availityAuthService: AvailityAuthService;
export declare function getAccessToken(): Promise<string>;
export declare function clearTokenCache(): void;
/** @internal Tests only */
export declare function _setCachedToken(token: CachedToken | null): void;
/** @internal Tests only */
export declare function _getCachedToken(): CachedToken | null;
//# sourceMappingURL=availity.auth.service.d.ts.map