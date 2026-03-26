import { describe, it, expect, beforeEach, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mod = await import("../src/lib/token-cache.js");
const { getAccessToken, clearTokenCache, _setCachedToken, _getCachedToken } =
  mod;

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

describe("token-cache / AvailityAuthService", () => {
  it("fetches a token on first call", async () => {
    mockTokenResponse();
    const token = await getAccessToken();
    expect(token).toMatch(/^tok_/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns cached token on subsequent calls", async () => {
    mockTokenResponse();
    const t1 = await getAccessToken();
    const t2 = await getAccessToken();
    expect(t1).toBe(t2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after clearTokenCache()", async () => {
    mockTokenResponse();
    await getAccessToken();
    clearTokenCache();
    mockTokenResponse();
    await getAccessToken();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("re-fetches when token is expired", async () => {
    _setCachedToken({
      accessToken: "expired",
      expiresAtEpochMs: Date.now() - 1000,
    });
    mockTokenResponse();
    const token = await getAccessToken();
    expect(token).not.toBe("expired");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws on failed token request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    await expect(getAccessToken()).rejects.toThrow(
      "Availity token request failed",
    );
  });
});
