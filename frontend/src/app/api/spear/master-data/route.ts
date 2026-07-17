import { NextResponse } from "next/server";
import { getMasterData, saveMasterData } from "@/lib/spear-master-data";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const master_data = await getMasterData();
  return NextResponse.json({ ok: true, master_data });
}

export async function PUT(req: Request) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const masterData = body.master_data && typeof body.master_data === "object" ? body.master_data : body;
  const saved = await saveMasterData({
    payers: Array.isArray(masterData.payers) ? masterData.payers : [],
    providers: Array.isArray(masterData.providers) ? masterData.providers : [],
    facilities: Array.isArray(masterData.facilities) ? masterData.facilities : [],
    carepaths: Array.isArray(masterData.carepaths) ? masterData.carepaths : [],
    kits: Array.isArray(masterData.kits) ? masterData.kits : [],
    code_sets: Array.isArray(masterData.code_sets) ? masterData.code_sets : [],
    unmatched_payers: Array.isArray(masterData.unmatched_payers) ? masterData.unmatched_payers : [],
  });
  return NextResponse.json({ ok: true, master_data: saved });
}
