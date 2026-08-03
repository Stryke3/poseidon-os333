import { NextResponse } from "next/server";
import { getRevenueMetrics } from "@/lib/poseidon-store";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  return NextResponse.json({ ok: true, metrics: await getRevenueMetrics(), source: "spear_persisted_case_store" });
}
