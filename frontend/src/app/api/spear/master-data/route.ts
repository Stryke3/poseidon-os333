import { NextResponse } from "next/server";
import { getMasterData, saveMasterData } from "@/lib/spear-master-data";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";
import { appendWorkflowEvent } from "@/lib/poseidon-store";

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
  if (auth.user?.role !== "admin") return NextResponse.json({ ok: false, error: "Admin role required to change routing master data." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const masterData = body.master_data && typeof body.master_data === "object" ? body.master_data : body;
  const providers = Array.isArray(masterData.providers) ? masterData.providers : [];
  const npiOwner = new Map<string, string>();
  for (const provider of providers) {
    const npi = String(provider?.npi || "").trim();
    if (!npi) continue;
    if (!/^\d{10}$/.test(npi)) {
      return NextResponse.json({
        ok: false,
        error: "Provider NPI must be exactly 10 digits.",
        provider_id: provider?.id || null,
        provider: provider?.display_name || provider?.last_name || null,
      }, { status: 422 });
    }
    const prior = npiOwner.get(npi);
    if (prior && prior !== String(provider?.id || "")) {
      return NextResponse.json({
        ok: false,
        error: "Duplicate provider NPI rejected.",
        npi,
        provider_ids: [prior, provider?.id || ""],
      }, { status: 422 });
    }
    npiOwner.set(npi, String(provider?.id || ""));
  }
  const saved = await saveMasterData({
    payers: Array.isArray(masterData.payers) ? masterData.payers : [],
    providers,
    facilities: Array.isArray(masterData.facilities) ? masterData.facilities : [],
    carepaths: Array.isArray(masterData.carepaths) ? masterData.carepaths : [],
    kits: Array.isArray(masterData.kits) ? masterData.kits : [],
    code_sets: Array.isArray(masterData.code_sets) ? masterData.code_sets : [],
    unmatched_payers: Array.isArray(masterData.unmatched_payers) ? masterData.unmatched_payers : [],
  });
  await appendWorkflowEvent("_master_data", "master_data_updated", {
    actor: { id: auth.user?.id, email: auth.user?.email, role: auth.user?.role },
    sections: Object.keys(masterData),
    payer_count: saved.payers.length,
    provider_count: saved.providers.length,
    updated_at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, master_data: saved });
}
