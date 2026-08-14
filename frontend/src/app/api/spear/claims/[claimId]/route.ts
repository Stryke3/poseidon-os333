import { NextResponse } from "next/server";
import { getClaim } from "@/lib/poseidon/revenue-records";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const { claimId } = await params;
  const claim = await getClaim(claimId);
  if (!claim) return NextResponse.json({ ok: false, error: "Claim not found" }, { status: 404 });
  return NextResponse.json({ ok: true, claim });
}
