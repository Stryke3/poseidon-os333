import { NextResponse } from "next/server";
import { listCases } from "@/lib/poseidon-store";
import { buildMobileData } from "@/lib/spear-mobile";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";
export const dynamic = "force-dynamic";
export async function GET() {
  const auth = await requireSpearApiAuth(); if (isSpearApiAuthFailure(auth)) return auth;
  const { actions, actionCounts, generatedAt } = buildMobileData(await listCases());
  return NextResponse.json({ ok: true, generatedAt, actionCounts, actions }, { headers: { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" } });
}
