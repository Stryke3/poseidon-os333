import { NextResponse } from "next/server";
import {
  getCase,
  listArtifacts,
  listDocuments,
  listTridentReviews,
  listWorkflowEvents,
  updateCaseAndAppendEvent,
} from "@/lib/poseidon-store";
import { getSpearNextAction } from "@/lib/spear-next-action";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

function withoutContent<T extends { content_base64?: string }>(record: T) {
  const rest = { ...record };
  delete rest.content_base64;
  return rest;
}

export async function GET(_req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const { caseId } = await params;
  const caseRecord = await getCase(caseId);
  if (!caseRecord) {
    return NextResponse.json({ ok: false, error: "Case not found", case_id: caseId }, { status: 404 });
  }

  const [documents, artifacts, reviews, workflowEvents] = await Promise.all([
    listDocuments(caseRecord.id),
    listArtifacts(caseRecord.id),
    listTridentReviews(caseRecord.id),
    listWorkflowEvents(caseRecord.id),
  ]);
  const latestTridentReview = reviews[reviews.length - 1] || null;
  const latestReviewPayload = latestTridentReview?.review && typeof latestTridentReview.review === "object"
    ? latestTridentReview.review as Record<string, unknown>
    : null;

  return NextResponse.json({
    ok: true,
    case: caseRecord,
    order: { id: caseRecord.order_id },
    documents: documents.map(withoutContent),
    artifacts: artifacts.map(withoutContent),
    latest_trident_review: latestTridentReview,
    signature_records: documents.filter((doc) => doc.kind === "signed_swo" || doc.kind === "signed_pod").map(withoutContent),
    pod_record: artifacts.find((artifact) => artifact.kind === "pod") ? withoutContent(artifacts.find((artifact) => artifact.kind === "pod")!) : null,
    tebra_export: artifacts.find((artifact) => artifact.kind === "tebra_staging_manifest") ? withoutContent(artifacts.find((artifact) => artifact.kind === "tebra_staging_manifest")!) : null,
    workflow_events: workflowEvents,
    readiness: getSpearNextAction(caseRecord, documents, latestReviewPayload, artifacts),
  });
}

const EDITABLE_FIELDS = new Set([
  "patient_name", "dob", "mrn", "phone", "email", "address", "payer", "member_id", "group_number",
  "provider", "npi", "facility", "supplier_name", "product", "laterality", "order_date", "date_of_service",
  "scheduled_dos", "hcpcs", "icd", "source_hcpcs", "source_icd", "final_hcpcs", "final_icd",
  "eligibility_status", "eligibility_verified_at", "eligibility_source", "benefit_verification_status",
  "benefit_verified_at", "benefit_source", "active_episode", "payer_accepts_retro_authorization",
  "payer_requires_claims_route", "adverse_determination_issued",
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const { caseId } = await params;
  const existing = await getCase(caseId);
  if (!existing) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const requestedPatch = body.patch && typeof body.patch === "object" ? body.patch as Record<string, unknown> : body;
  const patch = Object.fromEntries(Object.entries(requestedPatch).filter(([key]) => EDITABLE_FIELDS.has(key)));
  if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "No supported case fields were supplied." }, { status: 422 });
  const result = await updateCaseAndAppendEvent(existing.id, patch, "case_fields_updated", {
    actor: { id: auth.user?.id || "spear-operator", email: auth.user?.email || "unknown", role: auth.user?.role || "operator" },
    changed_fields: Object.keys(patch),
  });
  return NextResponse.json({ ok: true, case: result.case });
}
