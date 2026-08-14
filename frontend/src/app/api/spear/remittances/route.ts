import { NextResponse } from "next/server";
import { listCases } from "@/lib/poseidon-store";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const remittances = (await listCases()).flatMap((caseRecord) => Array.isArray(caseRecord.remittances) ? (caseRecord.remittances as unknown[]).map((remittance) => ({ ...remittance as Record<string, unknown>, caseId: caseRecord.id })) : []);
  return NextResponse.json({ ok: true, remittances });
}
