import { NextResponse } from "next/server";
import { resolveRevenueException } from "@/lib/poseidon/revenue-records";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const body = await req.json().catch(() => ({}));
  const { id } = await params;
  const caseId = String(body.case_id || body.caseId || "");
  if (!caseId) return NextResponse.json({ ok: false, error: "case_id is required" }, { status: 400 });
  const exception = await resolveRevenueException(caseId, id);
  if (!exception) return NextResponse.json({ ok: false, error: "Exception not found" }, { status: 404 });
  return NextResponse.json({ ok: true, exception });
}
