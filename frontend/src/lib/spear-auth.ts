import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSafeServerSession } from "@/lib/auth";

export type SpearAuthResult = {
  ok: boolean;
  mode: "nextauth" | "none";
  user?: {
    id?: string;
    email?: string;
    role?: string;
  };
  reason?: string;
};

export async function getSpearAuthFromCookies(): Promise<SpearAuthResult> {
  const session = await getSafeServerSession();
  if (session?.user?.id && session.user.role) {
    return {
      ok: true,
      mode: "nextauth",
      user: {
        id: session.user.id,
        email: session.user.email || undefined,
        role: session.user.role,
      },
    };
  }

  return {
    ok: false,
    mode: "none",
    reason: "Missing or invalid authenticated dashboard session.",
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
