import { createHash } from "node:crypto"
import type { SpearCase, SpearMasterData, StoredDocument } from "@/lib/poseidon-store"

export const AUTHORIZATION_STATUSES = ["RECEIVED","INTAKE_VALIDATION","ROUTE_DETERMINED","PACKET_BUILDING","PACKET_REVIEW_REQUIRED","REVIEWER_CERTIFIED","SUBMISSION_QUEUED","SUBMISSION_SENT","DELIVERY_CONFIRMED","PAYER_DISPOSITION_PENDING","BLOCKED_MISSING_DOCUMENTATION","BLOCKED_POLICY_UNVERIFIED","BLOCKED_ROUTING_UNVERIFIED","BLOCKED_DESTINATION_UNVERIFIED","SUBMISSION_FAILED","PAYER_NO_AUTH_REQUIRED_VERIFIED","AUTHORIZED","PARTIALLY_AUTHORIZED","DENIED","ADDITIONAL_INFORMATION_REQUESTED","CONCURRENT_REVIEW_PENDING","RETRO_REVIEW_PENDING","CLAIMS_REVIEW_PENDING","APPEAL_REQUIRED"] as const
export type AuthorizationStatus = typeof AUTHORIZATION_STATUSES[number]
export type ProceduralRoute = "prospective" | "concurrent" | "retrospective_authorization" | "retrospective_claims" | "appeal"
export type RouteDecision = { route: ProceduralRoute; title: string; basis: string[]; decided_at: string }
export type VerifiedDestination = { channel: "fax" | "portal" | "manual_exception"; destination: string; source: string; verified_at: string; verified_by: string }

function value(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) { const candidate = record[key]; if (candidate !== null && candidate !== undefined && String(candidate).trim()) return String(candidate).trim() }
  return ""
}
function list(candidate: unknown): string[] {
  if (Array.isArray(candidate)) return candidate.map(String).map((item) => item.trim()).filter(Boolean)
  return typeof candidate === "string" ? candidate.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean) : []
}

export function determineProceduralRoute(record: Record<string, unknown>, at = new Date()): RouteDecision {
  const when = at.toISOString()
  if (record.adverse_determination_issued || record.denial_issued_at) return { route: "appeal", title: "Claim Appeal Submission", basis: ["An adverse determination has been issued."], decided_at: when }
  if (record.active_episode || record.concurrent_review_required) return { route: "concurrent", title: "Concurrent Review Submission", basis: ["The episode of care is active."], decided_at: when }
  const rawDos = value(record, "date_of_service", "dos", "service_date", "scheduled_dos")
  const dos = rawDos ? new Date(rawDos) : null
  const afterDos = Boolean(dos && !Number.isNaN(dos.getTime()) && at.getTime() > dos.getTime() + 86_399_999)
  if (afterDos && (record.payer_requires_claims_route || record.claims_review_required)) return { route: "retrospective_claims", title: "Retrospective Claims Review Submission", basis: ["The date of service has passed.", "Payer rules require claims review."], decided_at: when }
  if (afterDos && (record.payer_accepts_retro_authorization || record.retro_authorization_accepted)) return { route: "retrospective_authorization", title: "Retrospective Authorization Request", basis: ["The date of service has passed.", "Payer rules accept retrospective authorization."], decided_at: when }
  return { route: "prospective", title: "Prior Authorization Request", basis: [dos ? "The request precedes the date of service." : "No completed date of service is present; prospective routing is the safe default."], decided_at: when }
}

export function validateProceduralRoute(record: Record<string, unknown>, decision: RouteDecision, at = new Date()) {
  const expected = determineProceduralRoute(record, at)
  return { ok: expected.route === decision.route && expected.title === decision.title, expected, received: decision }
}

export function payerRuleFor(record: Record<string, unknown>, masterData: SpearMasterData): Record<string, unknown> | null {
  const payerId = value(record, "canonical_payer_id", "payer_id").toLowerCase()
  const payerName = value(record, "canonical_payer", "payer").toLowerCase()
  return masterData.payers.find((payer) => {
    const id = value(payer, "id", "payer_id").toLowerCase()
    const name = value(payer, "name", "canonical_name", "payer_name").toLowerCase()
    return Boolean((payerId && payerId === id) || (payerName && payerName === name))
  }) || null
}

export function verifiedDestinationFor(payer: Record<string, unknown> | null): VerifiedDestination | null {
  if (!payer) return null
  const channel = value(payer, "authorization_channel", "submission_channel") || "fax"
  const destination = value(payer, "authorization_fax", "fax", "destination")
  const source = value(payer, "destination_source", "routing_source")
  const verified_at = value(payer, "destination_verified_at", "verified_at")
  const verified_by = value(payer, "destination_verified_by", "verified_by")
  if (!destination || !source || !verified_at || !verified_by || !["fax","portal","manual_exception"].includes(channel)) return null
  if (channel === "fax" && destination.replace(/\D/g, "").length < 10) return null
  return { channel: channel as VerifiedDestination["channel"], destination, source, verified_at, verified_by }
}

export function hasAffirmativeNoAuthEvidence(record: Record<string, unknown>) {
  return value(record, "auth_requirement").toLowerCase() === "not_required"
    && Boolean(value(record, "auth_requirement_verified_at"))
    && Boolean(value(record, "auth_requirement_verified_by"))
    && Boolean(value(record, "auth_requirement_evidence_ref", "payer_policy_version"))
    && Boolean(value(record, "auth_requirement_verification_method"))
    && Boolean(value(record, "auth_requirement_source", "payer_policy_source"))
}

export function authorizationGate(record: Record<string, unknown>) {
  const status = value(record, "authorization_status", "auth_status").toUpperCase() || "RECEIVED"
  const override_active = record.authorization_gate_override === true && Boolean(value(record, "authorization_override_reason")) && Boolean(value(record, "authorization_override_by")) && Boolean(value(record, "authorization_override_at"))
  const cleared = ["DELIVERY_CONFIRMED","PAYER_DISPOSITION_PENDING","AUTHORIZED","PARTIALLY_AUTHORIZED"].includes(status) || (["PAYER_NO_AUTH_REQUIRED_VERIFIED","NO_AUTH_REQUIRED_VERIFIED"].includes(status) && hasAffirmativeNoAuthEvidence(record))
  return { cleared: cleared || override_active, status, override_active, reason: cleared ? "Authorization transmission or payer disposition clears the gate." : override_active ? "A privileged, audited override clears the gate." : "Confirmed authorization delivery or affirmative no-auth evidence is required before fulfillment or billing." }
}

export function validateAuthorizationIntake(record: SpearCase, documents: StoredDocument[], payer: Record<string, unknown> | null) {
  const data = record as Record<string, unknown>
  const hcpcs = list(data.final_hcpcs || data.operator_approved_hcpcs || data.trident_recommended_hcpcs || data.hcpcs)
  const icd = list(data.final_icd || data.operator_approved_icd || data.trident_recommended_icd || data.icd)
  const required: Array<[string, unknown]> = [
    ["patient_name", data.patient_name], ["dob", data.dob], ["member_id", data.member_id], ["provider", data.provider], ["provider_npi", data.npi],
    ["date_of_service", data.date_of_service || data.dos || data.scheduled_dos], ["supplier_identity", data.supplier_name || data.facility],
    ["supplier_npi", data.supplier_npi || data.facility_npi], ["supplier_tin", data.supplier_tin || data.facility_tin],
    ["payer_plan_product", data.plan_product || data.payer_plan || payer?.plan_product], ["payer_jurisdiction", data.state || data.jurisdiction || payer?.state || payer?.jurisdiction],
    ["eligibility_verification", data.eligibility_status === "verified" ? data.eligibility_verified_at || "verified" : ""],
    ["benefit_verification", data.benefit_verification_status === "verified" ? data.benefit_verified_at || "verified" : ""],
    ["functional_deficit", data.functional_deficit], ["physician_assessment", data.physician_assessment],
    ["treatment_objective", data.treatment_objective], ["expected_clinical_benefit", data.expected_clinical_benefit],
    ["hcpcs_line_items", hcpcs], ["icd_10", icd],
  ]
  const missing_fields = required.filter(([, item]) => !item || (Array.isArray(item) && !item.length)).map(([name]) => name)
  const kinds = new Set(documents.map((document) => document.kind))
  const groups = [["physician_order",["physician_order","signed_swo"]],["clinical_notes",["clinical_notes"]],["diagnostic_evidence",["diagnostics","diagnostic_evidence"]],["eligibility_evidence",["eligibility","eligibility_evidence"]]] as const
  const missing_documents = groups.filter(([, accepted]) => !accepted.some((kind) => kinds.has(kind))).map(([name]) => name)
  const policy_verified = Boolean(payer && value(payer, "policy_version") && value(payer, "policy_source", "policy_url") && value(payer, "policy_verified_at"))
  const destination_verified = Boolean(verifiedDestinationFor(payer))
  let recommended_status: AuthorizationStatus = "ROUTE_DETERMINED"
  if (missing_fields.length || missing_documents.length) recommended_status = "BLOCKED_MISSING_DOCUMENTATION"
  else if (!policy_verified) recommended_status = "BLOCKED_POLICY_UNVERIFIED"
  else if (!destination_verified) recommended_status = "BLOCKED_DESTINATION_UNVERIFIED"
  return { ok: !missing_fields.length && !missing_documents.length && policy_verified && destination_verified, missing_fields, missing_documents, policy_verified, destination_verified, recommended_status }
}

export function buildAuthorizationIdempotencyKey(record: Record<string, unknown>, eventType: string, version = 0) {
  const parts = [value(record,"source","intake_source"),value(record,"referral_id","source_document_id"),value(record,"patient_id","patient_name"),value(record,"order_id","id"),value(record,"date_of_service","dos","scheduled_dos"),eventType,String(version || record.authorization_packet_version || 0)]
  return createHash("sha256").update(parts.join("|").toLowerCase()).digest("hex")
}

export function authorizationQueue(record: Record<string, unknown>) {
  const status = value(record,"authorization_status","auth_status").toUpperCase()
  if (["BLOCKED_MISSING_DOCUMENTATION","BLOCKED_POLICY_UNVERIFIED","BLOCKED_MISSING_POLICY","BLOCKED_ROUTING_UNVERIFIED","BLOCKED_ROUTING_AMBIGUITY","BLOCKED_DESTINATION_UNVERIFIED","SUBMISSION_FAILED"].includes(status)) return "exceptions"
  if (status === "PACKET_REVIEW_REQUIRED") return "reviewer_certification"
  if (["REVIEWER_CERTIFIED","SUBMISSION_QUEUED"].includes(status)) return "submission_queued"
  if (status === "SUBMISSION_SENT") return "awaiting_delivery"
  if (["DELIVERY_CONFIRMED","PAYER_DISPOSITION_PENDING"].includes(status)) return "awaiting_payer"
  if (["DENIED","APPEAL_REQUIRED","ADDITIONAL_INFORMATION_REQUESTED","CONCURRENT_REVIEW_PENDING","RETRO_REVIEW_PENDING","CLAIMS_REVIEW_PENDING"].includes(status)) return "appeals_and_follow_up"
  if (["AUTHORIZED","PARTIALLY_AUTHORIZED","PAYER_NO_AUTH_REQUIRED_VERIFIED","NO_AUTH_REQUIRED_VERIFIED"].includes(status)) return "cleared"
  return "intake_validation"
}
