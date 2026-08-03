import { NextResponse } from "next/server";
import {
  getCase,
  listArtifacts,
  listDocuments,
  listTridentReviews,
  listWorkflowEvents,
} from "@/lib/poseidon-store";
import { getSpearNextAction } from "@/lib/spear-next-action";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

function withoutContent<T extends { content_base64?: string }>(record: T) {
  const { content_base64: _content, ...rest } = record;
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
