import { NextResponse } from "next/server";
import { listCases } from "@/lib/poseidon-store";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const exceptions = (await listCases()).flatMap((caseRecord) => Array.isArray(caseRecord.revenue_exceptions) ? (caseRecord.revenue_exceptions as unknown[]).map((exception) => ({ ...exception as Record<string, unknown>, caseId: caseRecord.id })) : []);
  return NextResponse.json({ ok: true, exceptions });
}
