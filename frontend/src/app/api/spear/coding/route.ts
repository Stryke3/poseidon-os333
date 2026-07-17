import { NextResponse } from "next/server";
import { appendWorkflowEvent, getCase, updateCase } from "@/lib/poseidon-store";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

export async function POST(req: Request) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const caseId = String(body.case_id || "");
  const action = String(body.action || "");
  const operator = String(body.operator_identity || auth.user?.email || auth.user?.id || "spear_operator");
  if (!caseId) return NextResponse.json({ ok: false, error: "case_id is required" }, { status: 400 });

  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found", case_id: caseId }, { status: 404 });

  if (action === "approve_trident") {
    const hcpcs = list(caseRecord.trident_recommended_hcpcs);
    const icd = list(caseRecord.trident_recommended_icd).length ? list(caseRecord.trident_recommended_icd) : list(caseRecord.source_icd || caseRecord.icd);
    if (!hcpcs.length) return NextResponse.json({ ok: false, error: "No Trident HCPCS recommendation is available." }, { status: 422 });
    const updated = await updateCase(caseRecord.id, {
      operator_approved_hcpcs: hcpcs,
      final_hcpcs: hcpcs,
      hcpcs,
      operator_approved_icd: icd,
      final_icd: icd,
      icd,
      coding_status: "operator_approved",
      hcpcs_status: "approved",
      billing_status: "coding_approved",
    });
    await appendWorkflowEvent(caseRecord.id, "coding_approved", {
      operator,
      approved_hcpcs: hcpcs,
      approved_icd: icd,
      approved_at: new Date().toISOString(),
      reason: "Operator approved Trident configured-kit recommendation.",
    });
    return NextResponse.json({ ok: true, case: updated, approved_hcpcs: hcpcs, approved_icd: icd });
  }

  if (action === "override") {
    const reason = String(body.reason || "").trim();
    const hcpcs = list(body.hcpcs);
    const icd = list(body.icd).length ? list(body.icd) : list(caseRecord.source_icd || caseRecord.icd);
    if (!reason) return NextResponse.json({ ok: false, error: "Override reason is required." }, { status: 422 });
    if (!hcpcs.length) return NextResponse.json({ ok: false, error: "Override HCPCS code set is required." }, { status: 422 });
    const updated = await updateCase(caseRecord.id, {
      operator_approved_hcpcs: hcpcs,
      final_hcpcs: hcpcs,
      hcpcs,
      operator_approved_icd: icd,
      final_icd: icd,
      icd,
      coding_status: "operator_overridden",
      hcpcs_status: "approved",
      billing_status: "coding_approved",
    });
    await appendWorkflowEvent(caseRecord.id, "coding_overridden", {
      operator,
      reason,
      approved_hcpcs: hcpcs,
      approved_icd: icd,
      overridden_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, case: updated, approved_hcpcs: hcpcs, approved_icd: icd });
  }

  return NextResponse.json({ ok: false, error: `Unknown coding action: ${action}` }, { status: 400 });
}
