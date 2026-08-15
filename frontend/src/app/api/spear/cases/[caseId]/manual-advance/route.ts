import { NextResponse } from "next/server";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";
import { manualAdvanceCase } from "@/lib/spear-manual-advance";

export const dynamic = "force-dynamic";

function ip(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
}

export async function POST(req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const { caseId } = await params;
  const payload = await req.json().catch(() => ({}));
  const result = await manualAdvanceCase(caseId, {
    ...payload,
    attested_by: payload.attested_by || auth.user?.email || auth.user?.id,
    ip_address: ip(req),
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status });
  }
  return NextResponse.json(result, { status: result.status });
}
