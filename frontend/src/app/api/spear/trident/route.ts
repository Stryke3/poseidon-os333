import { NextResponse } from "next/server";
import {
  appendWorkflowEvent,
  getArtifact,
  getCase,
  getDocument,
  listArtifacts,
  listDocuments,
  listWorkflowEvents,
  readMasterData,
  saveArtifact,
  saveDocument,
  updateCaseAndAppendEvent,
  type SpearCase,
  type StoredArtifact,
} from "@/lib/poseidon-store";
import { isSpearApiAuthFailure, requireSpearApiAuth, type SpearAuthResult } from "@/lib/spear-auth";
import { buildTridentHardPacket } from "@/lib/services/packet/trident-hard-packet";
import {
  authorizationGate,
  authorizationQueue,
  buildAuthorizationIdempotencyKey,
  determineProceduralRoute,
  payerRuleFor,
  validateAuthorizationIntake,
  validateProceduralRoute,
  verifiedDestinationFor,
  type AuthorizationStatus,
  type RouteDecision,
} from "@/lib/trident/authorization";
import { faxProviderHealth, pollAuthorizationFax, sendAuthorizationFax } from "@/lib/trident/fax-adapter";

export const dynamic = "force-dynamic";

const CERTIFICATION_KEYS = [
  "route_correct",
  "policy_current",
  "destination_verified",
  "criteria_supported",
  "evidence_index_checked",
  "narrative_grounded",
  "exact_packet_reviewed",
] as const;

function actor(auth: SpearAuthResult) {
  return { id: auth.user?.id || "spear-operator", email: auth.user?.email || "unknown", role: auth.user?.role || "operator" };
}

function withoutBytes<T extends { content_base64?: string }>(record: T) {
  const safe = { ...record };
  delete safe.content_base64;
  return safe;
}

async function hydratedDocuments(caseId: string) {
  const metadata = await listDocuments(caseId);
  return (await Promise.all(metadata.map((document) => getDocument(document.id)))).filter(Boolean) as Awaited<ReturnType<typeof getDocument>>[] extends Array<infer U> ? Exclude<U, null>[] : never;
}

function routeFromCase(caseRecord: SpearCase): RouteDecision {
  const stored = caseRecord.authorization_route_decision;
  if (stored && typeof stored === "object" && !Array.isArray(stored)) return stored as RouteDecision;
  return determineProceduralRoute(caseRecord);
}

function packetVersion(artifact: StoredArtifact) {
  return Number(artifact.metadata.version || artifact.metadata.packet_version || 0) || 0;
}

function latestPacket(artifacts: StoredArtifact[], certified?: boolean) {
  return artifacts
    .filter((artifact) => artifact.kind === "trident_authorization_packet")
    .filter((artifact) => certified === undefined || Boolean(artifact.metadata.reviewer_certified) === certified)
    .sort((left, right) => packetVersion(right) - packetVersion(left))[0] || null;
}

async function alreadyProcessed(caseId: string, idempotencyKey: string, eventType: string) {
  const events = await listWorkflowEvents(caseId);
  return events.find((event) => event.event_type === eventType
    && event.payload && typeof event.payload === "object"
    && (event.payload as Record<string, unknown>).idempotency_key === idempotencyKey) || null;
}

async function transmit(caseRecord: SpearCase, packet: StoredArtifact, auth: SpearAuthResult, requestedKey?: string) {
  const masterData = await readMasterData();
  const payerRule = payerRuleFor(caseRecord, masterData);
  const destination = verifiedDestinationFor(payerRule);
  if (!destination) throw new Error("The payer submission destination is not verified.");
  const idempotencyKey = requestedKey || buildAuthorizationIdempotencyKey(caseRecord, "authorization_transmit", packetVersion(packet));
  const duplicate = await alreadyProcessed(caseRecord.id, idempotencyKey, "authorization_submission_sent");
  if (duplicate && caseRecord.authorization_fax_provider_id) {
    return { duplicate: true, provider_id: caseRecord.authorization_fax_provider_id, idempotency_key: idempotencyKey };
  }
  const result = await sendAuthorizationFax({ caseRecord, packet, destination, idempotencyKey });
  const history = Array.isArray(caseRecord.authorization_attempt_history) ? caseRecord.authorization_attempt_history : [];
  await updateCaseAndAppendEvent(caseRecord.id, {
    authorization_status: "SUBMISSION_SENT",
    auth_status: "SUBMISSION_SENT",
    authorization_fax_provider: result.provider,
    authorization_fax_provider_id: result.provider_id,
    authorization_destination: destination,
    authorization_submission_sent_at: result.accepted_at,
    authorization_packet_artifact_id: packet.id,
    authorization_packet_sha256: packet.sha256 || packet.metadata.sha256,
    authorization_last_idempotency_key: idempotencyKey,
    authorization_attempt_history: [...history, {
      attempt: history.length + 1,
      provider: result.provider,
      provider_id: result.provider_id,
      status: result.provider_status,
      destination: result.destination,
      sent_at: result.accepted_at,
      packet_artifact_id: packet.id,
      packet_sha256: packet.sha256 || packet.metadata.sha256,
      idempotency_key: idempotencyKey,
    }],
  }, "authorization_submission_sent", {
    actor: actor(auth), idempotency_key: idempotencyKey, provider: result.provider, provider_id: result.provider_id,
    packet_artifact_id: packet.id, packet_sha256: packet.sha256 || packet.metadata.sha256, destination,
  });
  return { ...result, idempotency_key: idempotencyKey };
}

export async function GET(req: Request) {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;
  const caseId = new URL(req.url).searchParams.get("case_id") || "";
  if (!caseId) return NextResponse.json({ ok: false, error: "case_id is required" }, { status: 400 });
  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
  const [documents, artifacts, events, masterData] = await Promise.all([
    listDocuments(caseRecord.id), listArtifacts(caseRecord.id), listWorkflowEvents(caseRecord.id), readMasterData(),
  ]);
  const payerRule = payerRuleFor(caseRecord, masterData);
  const route = routeFromCase(caseRecord);
  return NextResponse.json({
    ok: true,
    case_id: caseRecord.id,
    patient_name: caseRecord.patient_name,
    authorization_status: caseRecord.authorization_status || caseRecord.auth_status || "RECEIVED",
    route,
    queue: authorizationQueue(caseRecord),
    gate: authorizationGate(caseRecord),
    validation: validateAuthorizationIntake(caseRecord, documents, payerRule),
    payer_rule: payerRule,
    destination: verifiedDestinationFor(payerRule),
    fax_provider: faxProviderHealth(),
    packets: artifacts.filter((artifact) => artifact.kind === "trident_authorization_packet").map(withoutBytes),
    certification_records: artifacts.filter((artifact) => artifact.kind === "trident_reviewer_certification").map(withoutBytes),
    submission_events: events.filter((event) => event.event_type.startsWith("authorization_")),
  });
}

async function uploadEvidence(req: Request, auth: SpearAuthResult) {
  const form = await req.formData();
  const caseId = String(form.get("case_id") || "");
  const kind = String(form.get("kind") || "");
  const file = form.get("file") as File | null;
  const allowed = ["physician_order", "clinical_notes", "diagnostics", "eligibility_evidence", "pod", "manual_submission_confirmation"];
  if (!caseId || !file || !allowed.includes(kind)) return NextResponse.json({ ok: false, error: "case_id, file, and a supported evidence kind are required" }, { status: 400 });
  const caseRecord = await getCase(caseId);
  if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
  const document = await saveDocument({ case_id: caseRecord.id, kind, filename: file.name || `${kind}.pdf`, content_type: file.type || "application/pdf", content: Buffer.from(await file.arrayBuffer()) });
  await appendWorkflowEvent(caseRecord.id, "authorization_evidence_stored", { actor: actor(auth), document_id: document.id, kind, filename: document.filename, sha256: document.sha256 });
  return NextResponse.json({ ok: true, document: withoutBytes(document) }, { status: 201 });
}

export async function POST(req: Request) {
  try {
    const auth = await requireSpearApiAuth();
    if (isSpearApiAuthFailure(auth)) return auth;
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) return uploadEvidence(req, auth);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const caseId = String(body.case_id || body.order_id || "");
    const action = String(body.action || "");
    if (!caseId || !action) return NextResponse.json({ ok: false, error: "case_id and action are required" }, { status: 400 });
    let caseRecord = await getCase(caseId);
    if (!caseRecord) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
    const operator = actor(auth);
    const masterData = await readMasterData();
    const payerRule = payerRuleFor(caseRecord, masterData);
    const destination = verifiedDestinationFor(payerRule);

    if (action === "determine_route") {
      const route = determineProceduralRoute({ ...caseRecord, ...(body.routing_inputs && typeof body.routing_inputs === "object" ? body.routing_inputs as Record<string, unknown> : {}) });
      const documents = await listDocuments(caseRecord.id);
      const validation = validateAuthorizationIntake(caseRecord, documents, payerRule);
      const status: AuthorizationStatus = validation.ok ? "ROUTE_DETERMINED" : validation.recommended_status;
      const result = await updateCaseAndAppendEvent(caseRecord.id, {
        authorization_status: status, auth_status: status, authorization_route: route.route, procedural_title: route.title,
        authorization_route_decision: route, authorization_validation: validation,
      }, "authorization_route_determined", { actor: operator, route, validation });
      return NextResponse.json({ ok: true, case: result.case, route, validation });
    }

    if (action === "verify_no_auth_required") {
      const evidenceRef = String(body.evidence_ref || "").trim();
      const source = String(body.source || "").trim();
      const method = String(body.method || "").trim();
      const verifiedAt = String(body.verified_at || new Date().toISOString());
      if (!evidenceRef || !source || !method || !operator.email || body.confirmed !== true) return NextResponse.json({ ok: false, error: "Affirmative confirmation, evidence_ref, source, verification method, and operator identity are required." }, { status: 422 });
      const result = await updateCaseAndAppendEvent(caseRecord.id, {
        auth_requirement: "not_required", auth_requirement_evidence_ref: evidenceRef, auth_requirement_source: source,
        auth_requirement_verified_at: verifiedAt, auth_requirement_verified_by: operator.email, auth_requirement_verification_method: method,
        authorization_status: "PAYER_NO_AUTH_REQUIRED_VERIFIED", auth_status: "PAYER_NO_AUTH_REQUIRED_VERIFIED",
      }, "authorization_no_auth_required_verified", { actor: operator, evidence_ref: evidenceRef, source, method, representative: body.representative || null, verified_at: verifiedAt });
      return NextResponse.json({ ok: true, case: result.case, gate: authorizationGate(result.case || caseRecord) });
    }

    if (action === "build_packet") {
      const route = routeFromCase(caseRecord);
      const routeValidation = validateProceduralRoute(caseRecord, route);
      if (!routeValidation.ok) {
        await updateCaseAndAppendEvent(caseRecord.id, { authorization_status: "BLOCKED_ROUTING_UNVERIFIED", auth_status: "BLOCKED_ROUTING_UNVERIFIED" }, "authorization_routing_blocked", { actor: operator, ...routeValidation });
        return NextResponse.json({ ok: false, error: "Stored procedural route or packet title does not match the case posture.", route_validation: routeValidation }, { status: 422 });
      }
      const documents = await hydratedDocuments(caseRecord.id);
      const validation = validateAuthorizationIntake(caseRecord, documents, payerRule);
      if (!validation.ok || !destination || !payerRule) {
        await updateCaseAndAppendEvent(caseRecord.id, { authorization_status: validation.recommended_status, auth_status: validation.recommended_status, authorization_validation: validation }, "authorization_packet_blocked", { actor: operator, validation });
        return NextResponse.json({ ok: false, error: "Authorization packet prerequisites are incomplete.", validation }, { status: 422 });
      }
      const artifacts = await listArtifacts(caseRecord.id);
      const version = Math.max(0, ...artifacts.filter((artifact) => artifact.kind === "trident_authorization_packet").map(packetVersion)) + 1;
      await updateCaseAndAppendEvent(caseRecord.id, { authorization_status: "PACKET_BUILDING", auth_status: "PACKET_BUILDING" }, "authorization_packet_build_started", { actor: operator, version });
      const packet = await buildTridentHardPacket({ caseRecord, documents, route, destination, payerRule, version });
      const artifact = await saveArtifact({
        case_id: caseRecord.id, kind: "trident_authorization_packet", filename: `${caseRecord.id}-trident-authorization-v${version}.pdf`, content_type: "application/pdf", content: packet.bytes,
        metadata: { version, page_count: packet.page_count, sha256: packet.sha256, procedural_route: route.route, procedural_title: route.title, destination, evidence_index: packet.evidence_index, criteria_matrix: packet.criteria_matrix, reviewer_certified: false, immutable: true },
      });
      await updateCaseAndAppendEvent(caseRecord.id, {
        authorization_status: "PACKET_REVIEW_REQUIRED", auth_status: "PACKET_REVIEW_REQUIRED", authorization_packet_artifact_id: artifact.id,
        authorization_packet_version: version, authorization_packet_sha256: packet.sha256, authorization_packet_pages: packet.page_count,
      }, "authorization_packet_built", { actor: operator, artifact_id: artifact.id, version, sha256: packet.sha256, pages: packet.page_count });
      return NextResponse.json({ ok: true, artifact: withoutBytes(artifact), packet: { version, sha256: packet.sha256, pages: packet.page_count, title: packet.title } }, { status: 201 });
    }

    if (action === "certify_and_queue") {
      const answers = body.answers && typeof body.answers === "object" ? body.answers as Record<string, unknown> : {};
      const reviewerName = String(body.reviewer_name || "").trim();
      const reviewerRole = String(body.reviewer_role || "").trim();
      if (!reviewerName || !reviewerRole || CERTIFICATION_KEYS.some((key) => answers[key] !== true)) {
        return NextResponse.json({ ok: false, error: "Reviewer name, role, and affirmative answers to every certification item are required.", required_answers: CERTIFICATION_KEYS }, { status: 422 });
      }
      const artifacts = await listArtifacts(caseRecord.id);
      const sourceMetadata = latestPacket(artifacts, false);
      if (!sourceMetadata) return NextResponse.json({ ok: false, error: "A review packet must be built before certification." }, { status: 422 });
      const sourcePacket = await getArtifact(sourceMetadata.id);
      if (!sourcePacket) return NextResponse.json({ ok: false, error: "The exact review packet is unavailable." }, { status: 409 });
      if (!destination || !payerRule) return NextResponse.json({ ok: false, error: "Payer policy and verified destination are required." }, { status: 422 });
      const documents = await hydratedDocuments(caseRecord.id);
      const route = routeFromCase(caseRecord);
      const certification = {
        reviewer_name: reviewerName, reviewer_role: reviewerRole, reviewer_email: operator.email,
        certified_at: new Date().toISOString(), source_packet_artifact_id: sourcePacket.id,
        source_packet_sha256: String(sourcePacket.sha256 || sourcePacket.metadata.sha256 || ""),
        answers: Object.fromEntries(CERTIFICATION_KEYS.map((key) => [key, true])),
      };
      const version = Math.max(...artifacts.filter((artifact) => artifact.kind === "trident_authorization_packet").map(packetVersion)) + 1;
      const packet = await buildTridentHardPacket({ caseRecord, documents, route, destination, payerRule, version, certification });
      const certifiedPacket = await saveArtifact({
        case_id: caseRecord.id, kind: "trident_authorization_packet", filename: `${caseRecord.id}-trident-authorization-certified-v${version}.pdf`, content_type: "application/pdf", content: packet.bytes,
        metadata: { version, page_count: packet.page_count, sha256: packet.sha256, procedural_route: route.route, procedural_title: route.title, destination, evidence_index: packet.evidence_index, criteria_matrix: packet.criteria_matrix, reviewer_certified: true, certification, source_packet_artifact_id: sourcePacket.id, immutable: true },
      });
      const certificationArtifact = await saveArtifact({
        case_id: caseRecord.id, kind: "trident_reviewer_certification", filename: `${caseRecord.id}-certification-v${version}.json`, content_type: "application/json",
        content: Buffer.from(JSON.stringify({ ...certification, certified_packet_artifact_id: certifiedPacket.id, certified_packet_sha256: packet.sha256 }, null, 2)),
        metadata: { version, reviewer_name: reviewerName, certified_at: certification.certified_at, certified_packet_artifact_id: certifiedPacket.id, immutable: true },
      });
      await updateCaseAndAppendEvent(caseRecord.id, {
        authorization_status: "REVIEWER_CERTIFIED", auth_status: "REVIEWER_CERTIFIED", authorization_packet_artifact_id: certifiedPacket.id,
        authorization_packet_version: version, authorization_packet_sha256: packet.sha256, authorization_packet_pages: packet.page_count,
        authorization_certification_artifact_id: certificationArtifact.id, authorization_certified_at: certification.certified_at, authorization_certified_by: reviewerName,
      }, "authorization_reviewer_certified", { actor: operator, certification, packet_artifact_id: certifiedPacket.id, certification_artifact_id: certificationArtifact.id, sha256: packet.sha256, pages: packet.page_count });
      await updateCaseAndAppendEvent(caseRecord.id, { authorization_status: "SUBMISSION_QUEUED", auth_status: "SUBMISSION_QUEUED" }, "authorization_submission_queued", { actor: operator, packet_artifact_id: certifiedPacket.id });
      caseRecord = await getCase(caseRecord.id) || caseRecord;
      if (body.transmit_now === false) return NextResponse.json({ ok: true, queued: true, packet: withoutBytes(certifiedPacket), certification: withoutBytes(certificationArtifact) }, { status: 202 });
      try {
        const submission = await transmit(caseRecord, certifiedPacket, auth, String(body.idempotency_key || "") || undefined);
        return NextResponse.json({ ok: true, queued: true, packet: withoutBytes(certifiedPacket), certification: withoutBytes(certificationArtifact), submission }, { status: 202 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await appendWorkflowEvent(caseRecord.id, "authorization_submission_deferred", { actor: operator, packet_artifact_id: certifiedPacket.id, error: message, provider_health: faxProviderHealth() });
        return NextResponse.json({ ok: true, queued: true, packet: withoutBytes(certifiedPacket), certification: withoutBytes(certificationArtifact), transmission_deferred: true, error: message, provider_health: faxProviderHealth() }, { status: 202 });
      }
    }

    if (action === "transmit") {
      const artifacts = await listArtifacts(caseRecord.id);
      const packetMetadata = latestPacket(artifacts, true);
      if (!packetMetadata) return NextResponse.json({ ok: false, error: "A reviewer-certified packet is required." }, { status: 422 });
      const packet = await getArtifact(packetMetadata.id);
      if (!packet) return NextResponse.json({ ok: false, error: "Certified packet bytes are unavailable." }, { status: 409 });
      const submission = await transmit(caseRecord, packet, auth, String(body.idempotency_key || "") || undefined);
      return NextResponse.json({ ok: true, submission }, { status: 202 });
    }

    if (action === "poll_delivery") {
      const providerId = String(caseRecord.authorization_fax_provider_id || "");
      if (!providerId) return NextResponse.json({ ok: false, error: "No provider transmission ID is stored." }, { status: 422 });
      const receipt = await pollAuthorizationFax(providerId);
      if (receipt.delivered) {
        await updateCaseAndAppendEvent(caseRecord.id, {
          authorization_status: "DELIVERY_CONFIRMED", auth_status: "DELIVERY_CONFIRMED", authorization_delivery_status: receipt.status,
          authorization_delivery_confirmed_at: receipt.completed_at || receipt.checked_at, authorization_delivery_receipt: receipt,
        }, "authorization_delivery_confirmed", { actor: operator, ...receipt });
        await updateCaseAndAppendEvent(caseRecord.id, { authorization_status: "PAYER_DISPOSITION_PENDING", auth_status: "PAYER_DISPOSITION_PENDING" }, "authorization_payer_disposition_pending", { actor: operator, provider_id: providerId });
      } else if (receipt.failed) {
        await updateCaseAndAppendEvent(caseRecord.id, { authorization_status: "SUBMISSION_FAILED", auth_status: "SUBMISSION_FAILED", authorization_delivery_status: receipt.status, authorization_last_failure: receipt.failure_reason }, "authorization_submission_failed", { actor: operator, ...receipt });
      } else {
        await appendWorkflowEvent(caseRecord.id, "authorization_delivery_status_checked", { actor: operator, ...receipt });
      }
      return NextResponse.json({ ok: true, receipt, authorization_status: receipt.delivered ? "PAYER_DISPOSITION_PENDING" : receipt.failed ? "SUBMISSION_FAILED" : "SUBMISSION_SENT" });
    }

    if (action === "confirm_alternate_delivery") {
      if (!destination || destination.channel === "fax") return NextResponse.json({ ok: false, error: "Alternate confirmation is only valid for a verified portal/manual-exception route." }, { status: 422 });
      const confirmationId = String(body.confirmation_document_id || "");
      const confirmation = confirmationId ? await getDocument(confirmationId) : null;
      if (!confirmation || confirmation.kind !== "manual_submission_confirmation") return NextResponse.json({ ok: false, error: "A stored manual submission confirmation artifact is required." }, { status: 422 });
      await updateCaseAndAppendEvent(caseRecord.id, {
        authorization_status: "PAYER_DISPOSITION_PENDING", auth_status: "PAYER_DISPOSITION_PENDING", authorization_delivery_confirmed_at: new Date().toISOString(),
        authorization_delivery_receipt: { channel: destination.channel, confirmation_document_id: confirmation.id, confirmation_sha256: confirmation.sha256 },
      }, "authorization_delivery_confirmed", { actor: operator, channel: destination.channel, confirmation_document_id: confirmation.id, confirmation_sha256: confirmation.sha256 });
      return NextResponse.json({ ok: true, authorization_status: "PAYER_DISPOSITION_PENDING" });
    }

    if (action === "record_disposition") {
      const allowed: AuthorizationStatus[] = ["AUTHORIZED", "PARTIALLY_AUTHORIZED", "DENIED", "ADDITIONAL_INFORMATION_REQUESTED", "CONCURRENT_REVIEW_PENDING", "RETRO_REVIEW_PENDING", "CLAIMS_REVIEW_PENDING", "APPEAL_REQUIRED"];
      const disposition = String(body.disposition || "").toUpperCase() as AuthorizationStatus;
      if (!allowed.includes(disposition)) return NextResponse.json({ ok: false, error: "Unsupported payer disposition", allowed }, { status: 422 });
      const reference = String(body.payer_reference || "").trim();
      if (!reference) return NextResponse.json({ ok: false, error: "payer_reference is required." }, { status: 422 });
      const result = await updateCaseAndAppendEvent(caseRecord.id, { authorization_status: disposition, auth_status: disposition, authorization_payer_reference: reference, authorization_disposition_at: new Date().toISOString(), authorization_disposition_detail: body.detail || null }, "authorization_payer_disposition_recorded", { actor: operator, disposition, payer_reference: reference, detail: body.detail || null });
      return NextResponse.json({ ok: true, case: result.case, gate: authorizationGate(result.case || caseRecord) });
    }

    if (action === "override_gate") {
      const reason = String(body.reason || "").trim();
      const affectedLineItems = Array.isArray(body.affected_line_item_ids) ? body.affected_line_item_ids.map(String).filter(Boolean) : [];
      const followUpTask = String(body.follow_up_task || "").trim();
      const followUpDueAt = String(body.follow_up_due_at || "").trim();
      if (operator.role !== "admin" || reason.length < 12 || !affectedLineItems.length || !followUpTask || !followUpDueAt) return NextResponse.json({ ok: false, error: "An admin, specific written reason, affected line items, follow-up task, and follow-up due time are required." }, { status: 403 });
      const overriddenAt = new Date().toISOString();
      const result = await updateCaseAndAppendEvent(caseRecord.id, { authorization_gate_override: true, authorization_override_reason: reason, authorization_override_by: operator.email, authorization_override_at: overriddenAt, authorization_override_line_item_ids: affectedLineItems, authorization_override_follow_up: { task: followUpTask, due_at: followUpDueAt, status: "OPEN" } }, "authorization_gate_overridden", { actor: operator, reason, affected_line_item_ids: affectedLineItems, follow_up_task: followUpTask, follow_up_due_at: followUpDueAt, overridden_at: overriddenAt });
      return NextResponse.json({ ok: true, case: result.case, gate: authorizationGate(result.case || caseRecord) });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error("[spear/trident] action failed", error);
    return NextResponse.json({ ok: false, error: "TRIDENT authorization action failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
