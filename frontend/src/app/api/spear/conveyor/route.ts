import { NextResponse } from "next/server";
import {
  appendWorkflowEvent,
  getCase,
  listArtifacts,
  listDocuments,
  saveArtifact,
  saveArtifactAndUpdateCase,
  saveArtifacts,
  saveDocument,
  saveDocumentAndUpdateCase,
  saveTridentReviewAndUpdateCase,
  updateCase,
  updateCaseAndAppendEvent,
  type SpearCase,
} from "@/lib/poseidon-store";
import { buildConveyorPacket, packetFilename } from "@/lib/services/packet/conveyor-packets";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";
import { hasPayerSubmissionGate } from "@/lib/trident-v21";

export const dynamic = "force-dynamic";

const REQUIRED_FIELDS = ["patient_name", "dob", "payer", "member_id", "provider", "npi", "hcpcs", "icd", "laterality", "order_date"];

function listValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function operationalHcpcs(caseRecord: SpearCase) {
  return [
    ...listValue(caseRecord.final_hcpcs),
    ...listValue(caseRecord.operator_approved_hcpcs),
    ...listValue(caseRecord.trident_recommended_hcpcs),
    ...listValue(caseRecord.hcpcs),
    ...listValue(caseRecord.source_hcpcs),
  ].map(String).filter(Boolean);
}

function missingFields(caseRecord: SpearCase) {
  return REQUIRED_FIELDS.filter((field) => {
    const value = caseRecord[field];
    if (field === "hcpcs") return operationalHcpcs(caseRecord).length === 0;
    if (field === "icd") return listValue(caseRecord.final_icd || caseRecord.operator_approved_icd || caseRecord.trident_recommended_icd || caseRecord.icd || caseRecord.source_icd).length === 0;
    return !String(value || "").trim();
  });
}

async function buildArtifactInput(caseRecord: SpearCase, kind: string, title: string, packetKind: Parameters<typeof buildConveyorPacket>[0]["kind"], watermark?: string) {
  const packet = await buildConveyorPacket({
    caseRecord,
    kind: packetKind,
    title,
    watermark,
  });
  return {
    case_id: caseRecord.id,
    kind,
    filename: packetFilename(caseRecord, kind),
    content_type: "application/pdf",
    content: packet,
    metadata: { generated_by: "spear_conveyor", packet_kind: packetKind },
  };
}

async function generateArtifact(caseRecord: SpearCase, kind: string, title: string, packetKind: Parameters<typeof buildConveyorPacket>[0]["kind"], watermark?: string) {
  return saveArtifact(await buildArtifactInput(caseRecord, kind, title, packetKind, watermark));
}

async function runCompletenessReview(caseRecord: SpearCase) {
  const missing = missingFields(caseRecord);
  const score = Math.max(0, 100 - missing.length * 10);
  const reviewStatus = missing.length > 0 ? "blocked" : "pass";
  const review = {
    case_id: caseRecord.id,
    score,
    review_status: reviewStatus,
    billing_readiness: missing.length ? "blocked_missing_fields" : "ready_pending_signatures",
    missing_fields: missing,
    recommendations: missing.length
      ? missing.map((field) => `Complete ${field.replace(/_/g, " ")} before billing readiness.`)
      : ["Documentation set is complete for packet generation. Provider signature remains required."],
  };
  await saveTridentReviewAndUpdateCase(caseRecord.id, review, {
    status: reviewStatus === "pass" ? "trident_review_complete" : "blocked_missing_fields",
    trident_status: reviewStatus,
    missing_fields: missing,
  });
  return review;
}

async function jsonAction(body: Record<string, unknown>) {
  const caseId = String(body.case_id || body.order_id || "");
  const action = String(body.action || "");
  if (!caseId) return NextResponse.json({ ok: false, error: "case_id is required" }, { status: 400 });
  if (!action) return NextResponse.json({ ok: false, error: "action is required" }, { status: 400 });

  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found", case_id: caseId }, { status: 404 });

  if (action === "run_trident_review") {
    const review = await runCompletenessReview(caseRecord);
    return NextResponse.json({ ok: true, action, review });
  }

  if (action === "generate_provider_packet") {
    const review = await runCompletenessReview(caseRecord);
    if (review.review_status !== "pass") return NextResponse.json({ ok: false, action, review, error: "Missing fields block packet generation" }, { status: 422 });
    const artifactInputs = await Promise.all([
      buildArtifactInput(caseRecord, "coding_cover", "Coding Cover Sheet", "coding_cover"),
      buildArtifactInput(caseRecord, "provider_swo", "Standard Written Order", "provider_swo", "PENDING PROVIDER SIGNATURE"),
      buildArtifactInput(caseRecord, "payer_addendum", "Payer Provider Addendum", "payer_addendum"),
    ]);
    const [codingCover, swo, addendum] = await saveArtifacts(artifactInputs);
    await updateCaseAndAppendEvent(caseRecord.id, {
      status: "provider_packet_generated",
      billing_status: "provider_packet_ready",
      artifact_ids: [codingCover.id, swo.id, addendum.id],
    }, "provider_packet_generated", { artifact_ids: [codingCover.id, swo.id, addendum.id] });
    return NextResponse.json({ ok: true, action, artifacts: [codingCover, swo, addendum] });
  }

  if (action === "request_provider_signature") {
    await updateCaseAndAppendEvent(
      caseRecord.id,
      { status: "provider_signature_requested", billing_status: "provider_signature_required" },
      "provider_signature_requested",
      { method: "manual_upload" },
    );
    return NextResponse.json({ ok: true, action, signature_state: "manual_upload_required" });
  }

  if (action === "generate_billing_packet") {
    const payerGateSatisfied = hasPayerSubmissionGate(caseRecord);
    if (!payerGateSatisfied) {
      return NextResponse.json({
        ok: false,
        action,
        error: "Payer submission gate is not satisfied. Generate, certify, and transmit the TRIDENT hard packet or record verified no-authorization-required disposition before billing packet generation.",
        payer_submission_status: caseRecord.payer_submission_status || "NOT_READY",
        payer_disposition_status: caseRecord.payer_disposition_status || "NOT_STARTED",
      }, { status: 422 });
    }
  const documents = await listDocuments(caseRecord.id);
    if (!documents.some((doc) => doc.kind === "signed_swo")) {
      return NextResponse.json({ ok: false, action, error: "Signed SWO upload required before billing packet generation" }, { status: 422 });
    }
    const packetInput = await buildArtifactInput(caseRecord, "billing_packet", "Billing Packet", "billing_packet");
    const { artifact: packet } = await saveArtifactAndUpdateCase({
      ...packetInput,
      case_patch: { status: "billing_packet_generated", billing_status: "packet_generated" },
      event_type: "billing_packet_generated",
    });
    return NextResponse.json({ ok: true, action, artifact: packet });
  }

  if (action === "generate_pod") {
    const podInput = await buildArtifactInput(caseRecord, "pod", "Proof of Delivery", "pod", "PENDING RECIPIENT SIGNATURE");
    const { artifact: pod } = await saveArtifactAndUpdateCase({
      ...podInput,
      case_patch: { status: "pod_generated", pod_status: "signature_required" },
      event_type: "pod_generated",
    });
    return NextResponse.json({ ok: true, action, artifact: pod });
  }

  if (action === "record_delivery") {
    const artifacts = await listArtifacts(caseRecord.id);
    if (!artifacts.some((artifact) => artifact.kind === "pod")) {
      return NextResponse.json({ ok: false, action, error: "POD must be generated before delivery can be recorded" }, { status: 422 });
    }
    await updateCaseAndAppendEvent(
      caseRecord.id,
      { status: "delivery_recorded", pod_status: "delivery_recorded" },
      "delivery_recorded",
      { method: "operator_confirmation" },
    );
    return NextResponse.json({ ok: true, action, delivery_status: "recorded" });
  }

  if (action === "stage_tebra") {
    const artifacts = await listArtifacts(caseRecord.id);
    if (!artifacts.some((artifact) => artifact.kind === "billing_packet")) {
      return NextResponse.json({ ok: false, action, error: "Billing packet required before Tebra staging" }, { status: 422 });
    }
    if (caseRecord.status !== "delivery_recorded" && caseRecord.pod_status !== "delivery_recorded" && caseRecord.pod_status !== "signed") {
      return NextResponse.json({ ok: false, action, error: "Delivery must be recorded before Tebra staging" }, { status: 422 });
    }
    const tebraPacket = {
      case_id: caseRecord.id,
      order_id: caseRecord.order_id,
      patient_name: caseRecord.patient_name,
      dob: caseRecord.dob,
      payer: caseRecord.payer,
      member_id: caseRecord.member_id,
      provider: caseRecord.provider,
      npi: caseRecord.npi,
      hcpcs: caseRecord.hcpcs,
      provider_review_hcpcs: Array.from(new Set([...operationalHcpcs(caseRecord), "E0676"])),
      e0676_addendum: {
        included_in_packet: true,
        required_in_swo: true,
        billing_release_note: "E0676 requires provider sign-off and payer-specific coverage review before claim release.",
      },
      icd: caseRecord.icd,
      place_of_service: "12",
      tebra_submission_status: "staged_not_submitted",
      staged_at: new Date().toISOString(),
    };
    const { artifact } = await saveArtifactAndUpdateCase({
      case_id: caseRecord.id,
      kind: "tebra_staging_manifest",
      filename: packetFilename(caseRecord, "tebra_staging_manifest").replace(/\.pdf$/, ".json"),
      content_type: "application/json",
      content: Buffer.from(JSON.stringify(tebraPacket, null, 2)),
      metadata: { tebra_submission_status: "staged_not_submitted" },
      case_patch: { status: "tebra_ready", tebra_status: "staged_not_submitted" },
      event_type: "tebra_staged",
    });
    return NextResponse.json({ ok: true, action, tebra_submission_status: "staged_not_submitted", artifact, tebra_packet: tebraPacket });
  }

  if (action === "finalize_bill_ready") {
    const documents = await listDocuments(caseRecord.id);
    const refreshed = await getCase(caseRecord.id);
    if (!documents.some((doc) => doc.kind === "signed_swo")) return NextResponse.json({ ok: false, action, error: "Signed SWO required" }, { status: 422 });
    if (!documents.some((doc) => doc.kind === "signed_pod")) return NextResponse.json({ ok: false, action, error: "Signed POD required" }, { status: 422 });
    if (refreshed?.tebra_status !== "staged_not_submitted") return NextResponse.json({ ok: false, action, error: "Tebra staging manifest required" }, { status: 422 });
    const finalInput = await buildArtifactInput(refreshed, "final_bill_ready_packet", "Final Bill-Ready Packet", "final_bill_ready_packet");
    const { artifact: finalPacket } = await saveArtifactAndUpdateCase({
      ...finalInput,
      case_patch: {
        status: "ready_to_bill",
        billing_status: "ready",
        tebra_status: "staged_not_submitted",
      },
      event_type: "final_bill_ready_packet_generated",
    });
    return NextResponse.json({ ok: true, action, status: "ready_to_bill", artifact: finalPacket });
  }

  if (action === "archive_synthetic_test") {
    await updateCaseAndAppendEvent(caseRecord.id, {
      archived: true,
      archived_at: new Date().toISOString(),
      archive_reason: "synthetic_test",
    }, "synthetic_test_archived", { reason: "operator_archived_synthetic_test" });
    return NextResponse.json({ ok: true, action, archived: true });
  }

  return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}

async function uploadSignedDocument(req: Request) {
  const formData = await req.formData();
  const caseId = String(formData.get("case_id") || "");
  const action = String(formData.get("action") || "");
  const file = formData.get("file") as File | null;
  if (!caseId || !action || !file) return NextResponse.json({ ok: false, error: "case_id, action, and file are required" }, { status: 400 });

  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found", case_id: caseId }, { status: 404 });

  const kind = action === "upload_signed_swo" ? "signed_swo" : action === "upload_signed_pod" ? "signed_pod" : "";
  if (!kind) return NextResponse.json({ ok: false, error: `Unsupported upload action: ${action}` }, { status: 400 });

  const { document } = await saveDocumentAndUpdateCase({
    case_id: caseRecord.id,
    kind,
    filename: file.name || `${kind}.pdf`,
    content_type: file.type || "application/pdf",
    content: Buffer.from(await file.arrayBuffer()),
    case_patch: kind === "signed_swo"
      ? { status: "signed_swo_received", billing_status: "signed_swo_received" }
      : { status: "signed_pod_received", pod_status: "signed" },
    event_type: `${kind}_captured`,
    event_payload: {},
  });
  return NextResponse.json({ ok: true, action, document });
}

export async function GET(req: Request) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const caseId = searchParams.get("case_id") || "";
  if (!caseId) return NextResponse.json({ ok: false, error: "case_id is required" }, { status: 400 });
  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found", case_id: caseId }, { status: 404 });
  return NextResponse.json({
    ok: true,
    case: caseRecord,
    documents: await listDocuments(caseRecord.id),
    artifacts: await listArtifacts(caseRecord.id),
  });
}

export async function POST(req: Request) {
  try {
    const auth = await requireSpearApiAuth();
    if (isSpearApiAuthFailure(auth)) return auth;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) return uploadSignedDocument(req);
    const body = await req.json().catch(() => ({}));
    return jsonAction(body);
  } catch (error) {
    console.error("[spear/conveyor] action failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Conveyor action failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
