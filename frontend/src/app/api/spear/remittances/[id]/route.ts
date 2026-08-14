import { NextResponse } from "next/server";
import { listCases } from "@/lib/poseidon-store";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const { id } = await params;
  const remittance = (await listCases()).flatMap((caseRecord) => Array.isArray(caseRecord.remittances) ? caseRecord.remittances as Array<Record<string, unknown>> : []).find((row) => row.id === id);
  if (!remittance) return NextResponse.json({ ok: false, error: "Remittance not found" }, { status: 404 });
  return NextResponse.json({ ok: true, remittance });
}
