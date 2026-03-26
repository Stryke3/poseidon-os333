import { availityConfig } from "../../config.js";
import { httpRequest } from "../../lib/http.js";
import { AvailityAuthError, AvailityTimeoutError } from "../../lib/errors.js";
import { redactSensitiveFields } from "../../lib/audit.js";
import { logger } from "../../lib/logger.js";
import type { AvailityTokenResponse, CachedToken } from "../../types/availity.js";

const REFRESH_BUFFER_MS = 60_000;

let cachedToken: CachedToken | null = null;

function isTokenValid(token: CachedToken | null): boolean {
  if (!token) return false;
  return Date.now() < token.expiresAtEpochMs - REFRESH_BUFFER_MS;
}

/**
 * OAuth2 client-credentials for Availity. Tokens stay in memory only — never written to Prisma/audit.
 */
export class AvailityAuthService {
  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && isTokenValid(cachedToken)) {
      return cachedToken!.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: availityConfig.clientId,
      client_secret: availityConfig.clientSecret,
      scope: availityConfig.scope,
    });

    let response: Response;
    try {
      response = await httpRequest(
        availityConfig.tokenUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: body.toString(),
        },
        availityConfig.timeoutMs,
      );
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e?.name === "TimeoutError" || e?.name === "AbortError") {
        throw new AvailityTimeoutError(availityConfig.tokenUrl);
      }
      throw err;
    }

    const rawText = await response.text();

    let parsed: AvailityTokenResponse | unknown;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsed = { rawText };
    }

    if (!response.ok) {
      logger.error(
        { status: response.status, body: redactSensitiveFields(parsed) },
        "Availity token request failed",
      );
      throw new AvailityAuthError("Availity token request failed", {
        status: response.status,
        body: parsed,
      });
    }

    const tokenResponse = parsed as AvailityTokenResponse;

    if (!tokenResponse.access_token || !tokenResponse.expires_in) {
      throw new AvailityAuthError(
        "Invalid token payload returned from Availity",
        {
          body: parsed,
        },
      );
    }

    cachedToken = {
      accessToken: tokenResponse.access_token,
      expiresAtEpochMs: Date.now() + tokenResponse.expires_in * 1000,
    };

    logger.info(
      { expiresInSec: tokenResponse.expires_in },
      "Availity access token acquired",
    );

    return cachedToken.accessToken;
  }

  async healthCheck(): Promise<{ ok: true; tokenAcquired: true }> {
    await this.getAccessToken();
    return { ok: true, tokenAcquired: true };
  }
}

export const availityAuthService = new AvailityAuthService();

export async function getAccessToken(): Promise<string> {
  return availityAuthService.getAccessToken();
}

export function clearTokenCache(): void {
  cachedToken = null;
}

/** @internal Tests only */
export function _setCachedToken(token: CachedToken | null): void {
  cachedToken = token;
}

/** @internal Tests only */
export function _getCachedToken(): CachedToken | null {
  return cachedToken;
}
