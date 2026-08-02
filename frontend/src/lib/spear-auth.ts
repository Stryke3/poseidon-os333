import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export type SpearAuthResult = {
  ok: boolean;
  mode: "spear_session" | "nextauth" | "none";
  user?: {
    id?: string;
    email?: string;
    role?: string;
  };
  reason?: string;
};

const SPEAR_SESSION_VALUE = "spear-session-2026";

export async function getSpearAuthFromCookies(): Promise<SpearAuthResult> {
  const jar = await cookies();
  const spearSession = jar.get("spear_session")?.value;

  if (spearSession === SPEAR_SESSION_VALUE) {
    return {
      ok: true,
      mode: "spear_session",
      user: {
        id: "spear-admin",
        email: "admin@strykefox.com",
        role: "admin",
      },
    };
  }

  const nextAuthSession =
    jar.get("next-auth.session-token")?.value ||
    jar.get("__Secure-next-auth.session-token")?.value;

  if (nextAuthSession) {
    return {
      ok: true,
      mode: "nextauth",
      user: {
        role: "operator",
      },
    };
  }

  return {
    ok: false,
    mode: "none",
    reason: "Missing SPEAR session.",
  };
}

export async function requireSpearPageAuth(callbackUrl: string): Promise<SpearAuthResult> {
  const auth = await getSpearAuthFromCookies();
  if (!auth.ok) {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  return auth;
}

export async function requireSpearApiAuth(): Promise<SpearAuthResult | NextResponse> {
  const auth = await getSpearAuthFromCookies();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", reason: auth.reason },
      { status: 401 },
    );
  }
  return auth;
}

export function isSpearApiAuthFailure(value: SpearAuthResult | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
