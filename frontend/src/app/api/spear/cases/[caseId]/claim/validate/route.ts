import { NextResponse } from "next/server";
import { getCase } from "@/lib/poseidon-store";
import { validateCaseForClaim } from "@/lib/poseidon/revenue-records";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const { caseId } = await params;
  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
  return NextResponse.json({ ok: true, validation: validateCaseForClaim(caseRecord) });
}
