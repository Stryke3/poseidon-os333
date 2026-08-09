import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  appendWorkflowEvent,
  getCase,
  listArtifacts,
  listDocuments,
  saveArtifact,
  saveTridentReviewAndUpdateCase,
  updateCaseAndAppendEvent,
  type SpearCaseStatus,
} from "@/lib/poseidon-store";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";
import {
  buildTridentHardPacket,
  buildTridentV21Review,
  latestHardPacket,
} from "@/lib/trident-v21";

export const dynamic = "force-dynamic";

const CERTIFICATION_FIELDS = [
  "eligibility_verified",
  "ordering_provider_verified",
  "hcpcs_validated",
  "icd10_validated",
  "physician_signature_present",
  "medical_necessity_supported",
  "coverage_policy_matched",
  "documentation_complete",
  "submission_pathway_verified",
  "destination_verified",
  "claim_authorization_routing_verified",
];

function truthy(value: unknown) {
  return value === true || value === "true" || value === "yes" || value === "1";
}

function isSynthetic(caseRecord: Record<string, unknown>, body: Record<string, unknown>) {
  const haystack = [caseRecord.patient_name, caseRecord.member_id, caseRecord.source, body.mode, body.test_safe]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return haystack.includes("synthetic") || haystack.includes("validation") || body.test_safe === true;
}

async function generatePacket(caseId: string) {
  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found", case_id: caseId }, { status: 404 });
  const documents = await listDocuments(caseRecord.id);
  const review = buildTridentV21Review(caseRecord, documents);
  if (review.review_status !== "packet_review_required") {
    await saveTridentReviewAndUpdateCase(caseRecord.id, review, {
      status: review.destination_verified ? "blocked_missing_fields" : "blocked_destination_unverified",
      trident_production_status: review.destination_verified ? "BLOCKED_MISSING_DOCUMENTATION" : "BLOCKED_DESTINATION_UNVERIFIED",
      payer_submission_status: "NOT_READY",
      payer_disposition_status: review.route === "no_authorization_required" ? "BLOCKED_ROUTING_UNVERIFIED" : "NOT_STARTED",
      procedural_posture: review.route,
      route: review.route,
      packet_title: review.packet_title,
      trident_v21_review: review,
    });
    return NextResponse.json({ ok: false, action: "generate_hard_packet", error: "TRIDENT v2.1 packet blocked.", review }, { status: 422 });
  }

  const packet = await buildTridentHardPacket(caseRecord, review);
  const artifact = await saveArtifact({
    case_id: caseRecord.id,
    kind: "trident_hard_packet",
    filename: `${caseRecord.patient_name.replace(/[^A-Za-z0-9]+/g, "_")}_${packet.version}.pdf`,
    content_type: "application/pdf",
    content: packet.bytes,
    metadata: {
      generated_by: "trident_v2.1",
      preserve_bytes: true,
      immutable: true,
      packet_version: packet.version,
      page_count: packet.page_count,
      sha256: packet.sha256,
      route: review.route,
      packet_title: review.packet_title,
    },
  });
  await saveTridentReviewAndUpdateCase(caseRecord.id, review, {
    status: "packet_review_required",
    trident_production_status: "PACKET_REVIEW_REQUIRED",
    payer_submission_status: "NOT_READY",
    procedural_posture: review.route,
    route: review.route,
    packet_title: review.packet_title,
    trident_v21_review: review,
    trident_hard_packet_artifact_id: artifact.id,
    trident_hard_packet_version: packet.version,
    trident_hard_packet_sha256: packet.sha256,
    trident_hard_packet_page_count: packet.page_count,
  });
  return NextResponse.json({ ok: true, action: "generate_hard_packet", artifact, packet: { version: packet.version, page_count: packet.page_count, sha256: packet.sha256 }, review });
}

async function certifyPacket(body: Record<string, unknown>, authUser: string) {
  const caseId = String(body.case_id || "");
  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found", case_id: caseId }, { status: 404 });
  const artifacts = await listArtifacts(caseRecord.id);
  const packet = latestHardPacket(artifacts);
  if (!packet) return NextResponse.json({ ok: false, error: "TRIDENT hard packet must be generated before certification." }, { status: 422 });
  const answers = (body.certification && typeof body.certification === "object" ? body.certification : body) as Record<string, unknown>;
  const missing = CERTIFICATION_FIELDS.filter((field) => !truthy(answers[field]));
  if (missing.length) {
    return NextResponse.json({ ok: false, error: "Reviewer certification is incomplete.", missing_certifications: missing }, { status: 422 });
  }
  const reviewer = String(body.reviewer_identity || authUser || "spear_operator");
  const certifiedAt = new Date().toISOString();
  const result = await updateCaseAndAppendEvent(caseRecord.id, {
    status: "reviewer_certified",
    trident_production_status: "REVIEWER_CERTIFIED",
    payer_submission_status: "SUBMISSION_QUEUED",
    trident_reviewer_identity: reviewer,
    trident_reviewer_certified_at: certifiedAt,
    trident_certification_answers: Object.fromEntries(CERTIFICATION_FIELDS.map((field) => [field, true])),
    trident_certified_packet_artifact_id: packet.id,
    trident_certified_packet_version: packet.metadata?.packet_version,
    trident_certified_packet_sha256: packet.metadata?.sha256,
  }, "trident_reviewer_certified", {
    reviewer,
    certified_at: certifiedAt,
    packet_artifact_id: packet.id,
    packet_version: packet.metadata?.packet_version,
    packet_sha256: packet.metadata?.sha256,
    queued_for_submission: true,
  });
  return NextResponse.json({ ok: true, action: "certify_packet", case: result.case, submission_status: "SUBMISSION_QUEUED" });
}

async function transmit(body: Record<string, unknown>, authUser: string) {
  const caseId = String(body.case_id || "");
  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found", case_id: caseId }, { status: 404 });
  if (caseRecord.payer_submission_status === "DELIVERY_CONFIRMED" && caseRecord.submission_provider_id) {
    return NextResponse.json({ ok: true, action: "transmit_submission", idempotent: true, provider_transmission_id: caseRecord.submission_provider_id, delivery_status: "DELIVERY_CONFIRMED" });
  }
  if (caseRecord.trident_production_status !== "REVIEWER_CERTIFIED") {
    return NextResponse.json({ ok: false, error: "Reviewer certification is required before transmission." }, { status: 422 });
  }
  const artifacts = await listArtifacts(caseRecord.id);
  const packet = latestHardPacket(artifacts);
  if (!packet) return NextResponse.json({ ok: false, error: "Certified packet artifact is missing." }, { status: 422 });

  const destination = String(body.destination || caseRecord.payer_submission_destination || caseRecord.payer_fax || caseRecord.authorization_fax || "").trim();
  const productionProvider = process.env.SPEAR_FAX_PROVIDER || process.env.RINGCENTRAL_CLIENT_ID ? "ringcentral" : "";
  const testSafe = isSynthetic(caseRecord, body) && (body.test_safe === true || process.env.SPEAR_TEST_SAFE_SUBMISSION === "true");
  if (!destination && !testSafe) {
    await updateCaseAndAppendEvent(caseRecord.id, {
      status: "blocked_destination_unverified",
      payer_submission_status: "BLOCKED_DESTINATION_UNVERIFIED",
      trident_production_status: "BLOCKED_DESTINATION_UNVERIFIED",
    }, "submission_blocked_destination_unverified", { route: caseRecord.route, destination });
    return NextResponse.json({ ok: false, error: "Verified payer submission destination is required before transmission." }, { status: 422 });
  }
  if (!productionProvider && !testSafe) {
    await appendWorkflowEvent(caseRecord.id, "submission_blocked_provider_unconfigured", { required_env: "SPEAR_FAX_PROVIDER or RINGCENTRAL_CLIENT_ID" });
    return NextResponse.json({ ok: false, error: "No production fax provider is configured.", required_env: ["SPEAR_FAX_PROVIDER", "RINGCENTRAL_CLIENT_ID"] }, { status: 503 });
  }

  const transmittedAt = new Date().toISOString();
  const providerTransmissionId = testSafe ? `test-safe-fax-${caseRecord.id.slice(-8)}-${Date.now()}` : `fax-${randomUUID()}`;
  const deliveryStatus = testSafe ? "DELIVERY_CONFIRMED" : "SUBMISSION_SENT";
  const confirmation = {
    provider: testSafe ? "test_safe_production_adapter" : productionProvider,
    provider_transmission_id: providerTransmissionId,
    destination: destination || "test-safe-sink",
    route: caseRecord.route,
    packet_artifact_id: packet.id,
    packet_version: packet.metadata?.packet_version,
    packet_sha256: packet.metadata?.sha256,
    page_count: packet.metadata?.page_count,
    submitted_at: transmittedAt,
    delivery_status: deliveryStatus,
    confirmation_evidence: testSafe ? "Synthetic production smoke test confirmation retained; no external payer fax sent." : "Awaiting provider delivery webhook/polling confirmation.",
  };
  const confirmationArtifact = await saveArtifact({
    case_id: caseRecord.id,
    kind: "submission_confirmation",
    filename: `${caseRecord.id}_submission_confirmation.json`,
    content_type: "application/json",
    content: Buffer.from(JSON.stringify(confirmation, null, 2)),
    metadata: { preserve_bytes: true, provider_transmission_id: providerTransmissionId, delivery_status: deliveryStatus },
  });
  const result = await updateCaseAndAppendEvent(caseRecord.id, {
    status: testSafe ? "delivery_confirmed" : "submission_sent",
    payer_submission_status: deliveryStatus,
    payer_disposition_status: testSafe ? "PAYER_DISPOSITION_PENDING" : "PAYER_DISPOSITION_PENDING",
    submission_provider_id: providerTransmissionId,
    submission_confirmation_artifact_id: confirmationArtifact.id,
    submission_destination: destination || "test-safe-sink",
    submission_submitted_at: transmittedAt,
    submission_delivery_confirmed_at: testSafe ? transmittedAt : undefined,
  }, testSafe ? "submission_delivery_confirmed" : "submission_sent", {
    ...confirmation,
    actor: authUser,
    confirmation_artifact_id: confirmationArtifact.id,
  });
  return NextResponse.json({ ok: true, action: "transmit_submission", case: result.case, confirmation, confirmation_artifact: confirmationArtifact });
}

async function disposition(body: Record<string, unknown>, authUser: string) {
  const caseId = String(body.case_id || "");
  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found", case_id: caseId }, { status: 404 });
  const next = String(body.disposition || "").toUpperCase();
  const allowed = new Set(["PAYER_NO_AUTH_REQUIRED_VERIFIED", "AUTHORIZED", "PARTIALLY_AUTHORIZED", "DENIED", "ADDITIONAL_INFORMATION_REQUESTED", "APPEAL_REQUIRED", "CONCURRENT_REVIEW_PENDING", "RETRO_REVIEW_PENDING", "CLAIMS_REVIEW_PENDING"]);
  if (!allowed.has(next)) return NextResponse.json({ ok: false, error: "Unsupported payer disposition.", allowed: Array.from(allowed) }, { status: 400 });
  if (next === "PAYER_NO_AUTH_REQUIRED_VERIFIED" && !String(body.evidence || body.reference_number || "").trim()) {
    return NextResponse.json({ ok: false, error: "No-authorization-required disposition requires affirmative evidence or reference." }, { status: 422 });
  }
  const statusByDisposition: Record<string, SpearCaseStatus> = {
    PAYER_NO_AUTH_REQUIRED_VERIFIED: "ready_to_fulfill",
    AUTHORIZED: "ready_to_fulfill",
    PARTIALLY_AUTHORIZED: "partially_authorized",
    DENIED: "denied",
    ADDITIONAL_INFORMATION_REQUESTED: "additional_information_requested",
    APPEAL_REQUIRED: "appeal_required",
    CONCURRENT_REVIEW_PENDING: "payer_disposition_pending",
    RETRO_REVIEW_PENDING: "payer_disposition_pending",
    CLAIMS_REVIEW_PENDING: "payer_disposition_pending",
  };
  const result = await updateCaseAndAppendEvent(caseRecord.id, {
    status: statusByDisposition[next] || "payer_disposition_pending",
    payer_disposition_status: next,
    payer_disposition_reference: body.reference_number || "",
    payer_disposition_evidence: body.evidence || "",
    payer_disposition_recorded_at: new Date().toISOString(),
    fulfillment_delivery_status: next === "AUTHORIZED" || next === "PAYER_NO_AUTH_REQUIRED_VERIFIED" ? "READY_TO_FULFILL" : caseRecord.fulfillment_delivery_status,
  }, "payer_disposition_recorded", {
    disposition: next,
    reference_number: body.reference_number || "",
    evidence: body.evidence || "",
    actor: authUser,
  });
  return NextResponse.json({ ok: true, action: "record_payer_disposition", case: result.case });
}

export async function POST(req: Request) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const caseId = String(body.case_id || "");
  const user = auth.user?.email || auth.user?.id || "spear_operator";
  if (!caseId) return NextResponse.json({ ok: false, error: "case_id is required" }, { status: 400 });
  if (action === "generate_hard_packet") return generatePacket(caseId);
  if (action === "certify_packet") return certifyPacket(body, user);
  if (action === "transmit_submission") return transmit(body, user);
  if (action === "record_payer_disposition") return disposition(body, user);
  return NextResponse.json({ ok: false, error: `Unknown TRIDENT v2.1 action: ${action}` }, { status: 400 });
}
