import { describe, it, expect, beforeEach, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mod = await import("../src/modules/availity/availity.auth.service.js");
const { availityAuthService, clearTokenCache, _setCachedToken } = mod;

beforeEach(() => {
  clearTokenCache();
  mockFetch.mockReset();
});

function mockTokenResponse(expiresIn = 3600) {
  const access_token = "tok_" + Math.random().toString(36).slice(2);
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        access_token,
        expires_in: expiresIn,
        token_type: "bearer",
      }),
  });
}

describe("AvailityAuthService (availity.auth.service)", () => {
  it("fetches a token on first call", async () => {
    mockTokenResponse();
    const token = await availityAuthService.getAccessToken();
    expect(token).toMatch(/^tok_/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns cached token on subsequent calls", async () => {
    mockTokenResponse();
    const t1 = await availityAuthService.getAccessToken();
    const t2 = await availityAuthService.getAccessToken();
    expect(t1).toBe(t2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after clearTokenCache()", async () => {
    mockTokenResponse();
    await availityAuthService.getAccessToken();
    clearTokenCache();
    mockTokenResponse();
    await availityAuthService.getAccessToken();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("re-fetches when token is expired", async () => {
    _setCachedToken({
      accessToken: "expired",
      expiresAtEpochMs: Date.now() - 1000,
    });
    mockTokenResponse();
    const token = await availityAuthService.getAccessToken();
    expect(token).not.toBe("expired");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws on failed token request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    await expect(availityAuthService.getAccessToken()).rejects.toThrow(
      "Availity token request failed",
    );
  });

  it("healthCheck resolves after token acquisition", async () => {
    mockTokenResponse();
    const h = await availityAuthService.healthCheck();
    expect(h).toEqual({ ok: true, tokenAcquired: true });
  });
});
