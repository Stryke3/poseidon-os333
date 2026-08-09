import { NextResponse } from 'next/server';
import { getCase, saveTridentReviewAndUpdateCase } from '@/lib/poseidon-store';
import { isSpearApiAuthFailure, requireSpearApiAuth } from '@/lib/spear-auth';
import { getMasterData, recommendConfiguredKit } from '@/lib/spear-master-data';

const REQUIRED_FIELDS = [
  "patient_name",
  "dob",
  "payer",
  "member_id",
  "provider",
  "npi",
  "icd",
  "laterality",
  "order_date",
];

function listValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function missingFields(payload: Record<string, unknown>) {
  return REQUIRED_FIELDS.filter((field) => {
    const value = payload[field];
    if (field === "hcpcs" || field === "icd") return listValue(value).length === 0;
    return !String(value || "").trim();
  });
}

export async function POST(req: Request) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const body = await req.json().catch(() => ({}));
  const caseId = typeof body.case_id === "string" ? body.case_id : "";
  const storedCase = caseId ? await getCase(caseId) : null;
  if (caseId && !storedCase) {
    return NextResponse.json({ ok: false, error: "Case not found", case_id: caseId }, { status: 404 });
  }

  const payload = { ...(storedCase || {}), ...body } as Record<string, unknown>;
  const masterData = await getMasterData();
  const kitRecommendation = recommendConfiguredKit(payload, masterData);
  const recommendedHcpcs = kitRecommendation.hcpcsComponents.map((item) => String(item.hcpcs || item.code || "")).filter(Boolean);
  const sourceHcpcs = listValue(payload.source_hcpcs || payload.hcpcs).map(String);
  const codingConflicts = sourceHcpcs.length ? sourceHcpcs.filter((code) => !recommendedHcpcs.includes(code)) : [];
  const missing = missingFields(payload);
  const score = Math.max(0, 100 - missing.length * 8 - codingConflicts.length * 7);
  const reviewStatus = missing.length > 0 || codingConflicts.length > 0 ? "review" : "pass";
  const billingReadiness = missing.length > 0 ? "blocked_missing_fields" : "ready_pending_coding_approval";
  const recommendations = missing.length > 0
    ? missing.map((field) => `Complete ${field.replace(/_/g, " ")} before billing readiness.`)
    : codingConflicts.length
      ? ["Source HCPCS differs from configured kit. Operator coding review required."]
      : [
          "Documentation set is complete for Trident review. Prepare signature and fulfillment workflow.",
          kitRecommendation.payerType === "commercial"
            ? "Commercial plan: full knee recovery kit is available for operator/payer-policy review, including E0676 when documentation supports the NOC narrative."
            : "Medicare/Medicaid payer: E0676 is blocked; review remaining brace, TENS, compression, and icing lines against policy before billing.",
        ];

  const resolvedCaseId = storedCase?.id || caseId || "";
  const review = {
    case_id: resolvedCaseId,
    score,
    review_status: reviewStatus,
    billing_readiness: billingReadiness,
    missing_fields: missing,
    payer_type: kitRecommendation.payerType,
    recommended_carepath: kitRecommendation.carepath ? { id: kitRecommendation.carepath.id, name: kitRecommendation.carepath.name } : null,
    recommended_kit: kitRecommendation.kit ? { id: kitRecommendation.kit.id, name: kitRecommendation.kit.name } : null,
    recommended_hcpcs: kitRecommendation.hcpcsComponents.map((item) => ({
      code: item.hcpcs || item.code,
      description: item.description,
      quantity: item.quantity,
      modifier: item.modifier,
      rationale: item.noc_narrative || "Configured kit recommendation from Trident master data.",
      confidence: 0.82,
      requires_noc_narrative: item.requires_noc_narrative === true,
      payer_policy: item.payer_policy || "",
    })),
    excluded_hcpcs: kitRecommendation.excludedComponents.map((item) => ({
      code: item.hcpcs || item.code,
      description: item.description,
      reason: item.payer_policy === "commercial_only"
        ? "Commercial/private payer only; excluded for Medicare/Medicaid compliance."
        : "Excluded by payer policy.",
    })),
    source_hcpcs: sourceHcpcs,
    coding_conflicts: codingConflicts,
    missing_inputs: missing,
    recommendations,
  };

  if (resolvedCaseId) {
    await saveTridentReviewAndUpdateCase(resolvedCaseId, review, {
      status: missing.length ? "blocked_missing_fields" : "trident_review_complete",
      trident_status: reviewStatus,
      missing_fields: missing,
      carepath_id: String(kitRecommendation.carepath?.id || ""),
      carepath_name: String(kitRecommendation.carepath?.name || ""),
      recommended_kit_id: String(kitRecommendation.kit?.id || ""),
      recommended_kit_name: String(kitRecommendation.kit?.name || ""),
      trident_recommended_hcpcs: recommendedHcpcs,
      hcpcs_status: recommendedHcpcs.length ? "trident_recommended" : "pending_trident",
      coding_status: "trident_recommended",
    });
  }

  return NextResponse.json({ ok: true, ...review });
}
