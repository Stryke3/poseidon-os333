import { NextResponse } from "next/server";
import { getCase } from "@/lib/poseidon-store";
import { routeAuthorization } from "@/lib/poseidon/authorization-router";
import { appendAuthorization } from "@/lib/poseidon/revenue-records";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const { caseId } = await params;
  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
  const decision = routeAuthorization(caseRecord);
  await appendAuthorization(caseRecord, decision);
  return NextResponse.json({ ok: true, authorization: decision });
}
