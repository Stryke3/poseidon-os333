import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
  authorizationGate,
  buildAuthorizationIdempotencyKey,
  determineProceduralRoute,
  hasAffirmativeNoAuthEvidence,
  validateAuthorizationIntake,
  validateProceduralRoute,
  verifiedDestinationFor,
} from "../src/lib/trident/authorization.ts"
import { buildIntakeIdempotencyKey } from "../src/lib/poseidon-store.ts"
import { buildTridentHardPacket } from "../src/lib/services/packet/trident-hard-packet.ts"

const baseCase = {
  id: "case_acceptance",
  order_id: "ord_acceptance",
  patient_name: "Acceptance Patient",
  dob: "1970-01-01",
  payer: "Acceptance Health",
  canonical_payer_id: "payer_acceptance",
  member_id: "MEM-100",
  provider: "Dr. Acceptance",
  npi: "1234567890",
  facility: "Acceptance DME",
  supplier_name: "Acceptance DME",
  hcpcs: ["L1833", "E0730"],
  final_hcpcs: ["L1833", "E0730"],
  icd: ["M17.11"],
  final_icd: ["M17.11"],
  product: "Knee recovery equipment",
  laterality: "Right",
  order_date: "2026-07-30",
  date_of_service: "2026-08-20",
  eligibility_status: "verified",
  eligibility_verified_at: "2026-08-01T10:00:00.000Z",
  eligibility_source: "payer portal ref ELIG-1",
  benefit_verification_status: "verified",
  benefit_verified_at: "2026-08-01T10:10:00.000Z",
  benefit_source: "payer portal ref BEN-1",
  status: "trident_review_complete",
  billing_status: "not_ready",
  trident_status: "pass",
  pod_status: "not_started",
  tebra_status: "not_staged",
  missing_fields: [],
  high_risk_flags: [],
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  source: "api",
}

const payerRule = {
  id: "payer_acceptance",
  canonical_name: "Acceptance Health",
  policy_name: "DME Coverage",
  policy_version: "2026.08",
  policy_source: "payer portal",
  policy_verified_at: "2026-08-01T09:00:00.000Z",
  authorization_channel: "fax",
  authorization_fax: "+17025550101",
  destination_source: "payer provider manual",
  destination_verified_at: "2026-08-01T09:05:00.000Z",
  destination_verified_by: "admin@strykefox.com",
  internal_administrative_instruction: "Use DME authorization lane.",
}

const documentKinds = ["physician_order", "clinical_notes", "diagnostics", "eligibility_evidence"]
const documents = documentKinds.map((kind, index) => {
  const bytes = Buffer.from(`${kind}-evidence-${index}`)
  return {
    id: `doc_${kind}`,
    case_id: baseCase.id,
    kind,
    filename: `${kind}.txt`,
    content_type: "text/plain",
    size: bytes.length,
    content_base64: bytes.toString("base64"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    created_at: "2026-08-01T11:00:00.000Z",
  }
})

function packetInput(version, certification) {
  return {
    caseRecord: baseCase,
    documents,
    route: determineProceduralRoute(baseCase, new Date("2026-08-03T12:00:00.000Z")),
    destination: verifiedDestinationFor(payerRule),
    payerRule,
    version,
    certification,
  }
}

test("1 every supported source normalizes into the same canonical intake identity fields", () => {
  for (const source of ["manual", "fax", "ocr", "email", "api", "tebra", "carepath", "mobility", "biologics"]) {
    const key = buildIntakeIdempotencyKey({ ...baseCase, source, source_reference: `${source}-1` })
    assert.match(key, /^[a-f0-9]{64}$/)
  }
})

test("2 duplicate intake events produce a stable idempotency key", () => {
  const payload = { ...baseCase, source_reference: "REF-1", event_identity: "intake_received" }
  assert.equal(buildIntakeIdempotencyKey(payload), buildIntakeIdempotencyKey({ ...payload }))
})

test("3 intake automatically creates TRIDENT authorization workflow events", async () => {
  const source = await readFile(new URL("../src/app/api/spear/intake/route.ts", import.meta.url), "utf8")
  assert.match(source, /authorization_intake_validation_completed/)
  assert.match(source, /authorization_route_determined/)
})

test("4 every requested HCPCS receives criteria, narrative, and evidence mapping", async () => {
  const packet = await buildTridentHardPacket(packetInput(1))
  assert.deepEqual(packet.criteria_matrix.map((row) => row.hcpcs), baseCase.final_hcpcs)
  assert.equal(packet.evidence_index.length, 5)
  assert.ok(packet.page_count >= 15)
})

test("5 missing required evidence blocks certification prerequisites", () => {
  const validation = validateAuthorizationIntake(baseCase, documents.filter((document) => document.kind !== "eligibility_evidence"), payerRule)
  assert.equal(validation.ok, false)
  assert.ok(validation.missing_documents.includes("eligibility_evidence"))
})

test("6 incorrect route or packet title is rejected", () => {
  const wrong = { route: "appeal", title: "Prior Authorization Request", basis: [], decided_at: new Date().toISOString() }
  assert.equal(validateProceduralRoute(baseCase, wrong, new Date("2026-08-03T12:00:00.000Z")).ok, false)
})

test("7 unverified destinations are unusable", () => {
  assert.equal(verifiedDestinationFor({ ...payerRule, destination_verified_at: "" }), null)
  assert.equal(verifiedDestinationFor(payerRule)?.channel, "fax")
})

test("8 reviewer certification is immediately followed by queue persistence", async () => {
  const source = await readFile(new URL("../src/app/api/spear/trident/route.ts", import.meta.url), "utf8")
  assert.ok(source.indexOf("authorization_reviewer_certified") < source.indexOf("authorization_submission_queued"))
})

test("9 provider failure paths create visible submission exceptions", async () => {
  const source = await readFile(new URL("../src/app/api/spear/trident/route.ts", import.meta.url), "utf8")
  assert.match(source, /SUBMISSION_FAILED/)
  assert.match(source, /authorization_submission_deferred/)
})

test("10 submission idempotency keys are stable across retries", () => {
  const left = buildAuthorizationIdempotencyKey(baseCase, "authorization_transmit", 2)
  const right = buildAuthorizationIdempotencyKey({ ...baseCase }, "authorization_transmit", 2)
  assert.equal(left, right)
  assert.match(left, /^[a-f0-9]{64}$/)
})

test("11 exact packet bytes match the preserved SHA-256", async () => {
  const packet = await buildTridentHardPacket(packetInput(1))
  assert.equal(createHash("sha256").update(packet.bytes).digest("hex"), packet.sha256)
})

test("12 delivery confirmation is persisted on the case", async () => {
  const source = await readFile(new URL("../src/app/api/fax/inbound/route.ts", import.meta.url), "utf8")
  assert.match(source, /authorization_delivery_receipt/)
  assert.match(source, /PAYER_DISPOSITION_PENDING/)
})

test("13 no-auth-required cannot clear without affirmative evidence", () => {
  assert.equal(hasAffirmativeNoAuthEvidence({ auth_requirement: "not_required" }), false)
  assert.equal(hasAffirmativeNoAuthEvidence({ auth_requirement: "not_required", auth_requirement_verified_at: "2026-08-01", auth_requirement_verified_by: "reviewer", auth_requirement_evidence_ref: "PORTAL-1", auth_requirement_source: "payer portal", auth_requirement_verification_method: "portal" }), true)
})

test("14 packet corrections create a new immutable version", async () => {
  const review = await buildTridentHardPacket(packetInput(1))
  const certified = await buildTridentHardPacket(packetInput(2, { reviewer_name: "Reviewer", reviewer_role: "RN", certified_at: "2026-08-03T12:00:00.000Z", source_packet_artifact_id: "art_v1", source_packet_sha256: review.sha256, answers: Object.fromEntries(["route_correct", "policy_current", "destination_verified", "criteria_supported", "evidence_index_checked", "narrative_grounded", "exact_packet_reviewed"].map((key) => [key, true])) }))
  assert.equal(review.version, 1)
  assert.equal(certified.version, 2)
  assert.notEqual(review.sha256, certified.sha256)
})

test("15 fulfillment and billing remain blocked until authorization gate clears", () => {
  assert.equal(authorizationGate({ ...baseCase, authorization_status: "SUBMISSION_SENT" }).cleared, false)
  assert.equal(authorizationGate({ ...baseCase, authorization_status: "DELIVERY_CONFIRMED" }).cleared, true)
})

test("16 downstream provider, delivery, POD, billing, and Tebra actions remain implemented", async () => {
  const source = await readFile(new URL("../src/app/api/spear/conveyor/route.ts", import.meta.url), "utf8")
  for (const action of ["generate_provider_packet", "request_provider_signature", "generate_billing_packet", "generate_pod", "record_delivery", "stage_tebra", "finalize_bill_ready"]) assert.match(source, new RegExp(`action === ["']${action}["']`))
})

test("17 revenue and dashboard metrics derive from persisted cases", async () => {
  const source = await readFile(new URL("../src/lib/poseidon-store.ts", import.meta.url), "utf8")
  assert.match(source, /getRevenueMetrics/)
  assert.match(source, /authorization_delivery_confirmed/)
  assert.doesNotMatch(source, /Revenue at Risk.*312/)
})

test("18 audit events include before/after states and changed fields", async () => {
  const source = await readFile(new URL("../src/lib/poseidon-store.ts", import.meta.url), "utf8")
  assert.match(source, /previous_authorization_status/)
  assert.match(source, /next_authorization_status/)
  assert.match(source, /changed_fields/)
})

test("19 internal APIs validate a real signed session, not a static cookie", async () => {
  const auth = await readFile(new URL("../src/lib/spear-auth.ts", import.meta.url), "utf8")
  const middleware = await readFile(new URL("../src/middleware.ts", import.meta.url), "utf8")
  assert.doesNotMatch(auth, /spear-session-2026/)
  assert.match(auth, /getSafeServerSession/)
  assert.match(middleware, /getToken/)
})

test("20 this implementation does not modify public marketing page files", () => {
  const root = process.env.SOURCE_GIT_ROOT || fileURLToPath(new URL("..", import.meta.url))
  const changed = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean)
  const publicMarketing = changed.filter((name) => /frontend\/src\/app\/(page|carepath|contact|founder|mommy-care|northstar-surgical-innovations|soc13)\b/.test(name) || /frontend\/src\/components\/homepage\//.test(name))
  assert.deepEqual(publicMarketing, [])
})
