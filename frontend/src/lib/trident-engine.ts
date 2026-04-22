import { liteServerFetch } from "@/lib/lite-api"
import { getCodeMappings, type CodeMapping, getTemplates, type ProcedureFamily } from "@/lib/trident-settings"

type LitePatient = {
  id: string
  first_name: string
  last_name: string
  dob: string | null
  phone: string | null
  email: string | null
  address: string | null
  payer_name: string | null
  member_id: string | null
  ordering_provider: string | null
  diagnosis_codes: string[]
  hcpcs_codes: string[]
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

type LiteUpload = {
  id: string
  patient_id: string
  category: string
  filename: string
  storage_path: string
  mime_type: string | null
  uploaded_at: string | null
  metadata: Record<string, unknown>
}

type LiteGenerated = {
  id: string
  patient_id: string
  document_type: string
  content: string
  file_path: string | null
  created_at: string | null
  metadata: Record<string, unknown>
}

export type ReviewState = "READY_TO_GENERATE" | "DRAFT_NOT_READY" | "BLOCKED"

export type TridentGeneratedDocument = {
  id: string
  case_id: string
  type: "SWO" | "ADDENDUM" | "OTHER"
  template_version: string
  rendered_html: string
  rendered_pdf_path: string | null
  json_payload: Record<string, unknown>
  status: "draft" | "final"
  created_at: string | null
}

export type ExtractionField = {
  case_id: string
  field_name: string
  field_value: string | null
  confidence: number
  source_document_id: string | null
  source_page: number | null
  extraction_method: "manual_record" | "text" | "ocr" | "inferred"
  requires_review: boolean
}

export type RuleHit = {
  case_id: string
  rule_name: string
  severity: "info" | "warning" | "blocking"
  message: string
  blocking: boolean
}

export type TridentCaseSummary = {
  id: string
  status: ReviewState
  patient_first_name: string
  patient_last_name: string
  dob: string | null
  primary_insurance: string | null
  provider_name: string | null
  procedure_family: ProcedureFamily
  laterality: "RT" | "LT" | "bilateral" | "unknown"
  review_flags: string[]
  generated_documents: TridentGeneratedDocument[]
}

export type TridentCaseDetail = {
  id: string
  status: ReviewState
  patient_first_name: string
  patient_last_name: string
  dob: string | null
  sex: string | null
  phone: string | null
  address_1: string | null
  address_2: string | null
  city: string | null
  state: string | null
  zip: string | null
  primary_insurance: string | null
  secondary_insurance: string | null
  member_id_primary: string | null
  member_id_secondary: string | null
  procedure_name: string | null
  procedure_family: ProcedureFamily
  laterality: "RT" | "LT" | "bilateral" | "unknown"
  surgery_date: string | null
  order_date: string | null
  bmi: string | null
  provider_name: string | null
  provider_npi: string | null
  facility_name: string | null
  diagnosis_codes: string[]
  diagnosis_text: string[]
  dvt_risk_factors: string[]
  dvt_risk_score: number | null
  mobility_limitation_present: boolean
  fall_risk_present: boolean
  review_flags: string[]
  source_documents: LiteUpload[]
  generated_documents: TridentGeneratedDocument[]
  extracted_fields: ExtractionField[]
  rule_hits: RuleHit[]
  internal_export_json: Record<string, unknown>
  code_mappings: CodeMapping[]
  templates: ReturnType<typeof getTemplates>
}

function textCorpus(patient: LitePatient): string {
  return [patient.notes || "", patient.diagnosis_codes.join(" "), patient.hcpcs_codes.join(" ")].join(" ").toLowerCase()
}

function detectProcedureFamily(patient: LitePatient): ProcedureFamily {
  const corpus = textCorpus(patient)
  if (/\b(tka|total knee|knee arthroplasty|knee replacement)\b/.test(corpus)) return "TKA"
  if (/\b(tha|total hip|hip arthroplasty|hip replacement)\b/.test(corpus)) return "THA"
  return "other"
}

function detectLaterality(patient: LitePatient): "RT" | "LT" | "bilateral" | "unknown" {
  const corpus = textCorpus(patient)
  const hasRight = /\b(right|rt)\b/.test(corpus)
  const hasLeft = /\b(left|lt)\b/.test(corpus)
  if (hasRight && hasLeft) return "bilateral"
  if (hasRight) return "RT"
  if (hasLeft) return "LT"
  return "unknown"
}

function inferReviewState(ruleHits: RuleHit[]): ReviewState {
  if (ruleHits.some((hit) => hit.blocking)) return "BLOCKED"
  if (ruleHits.length) return "DRAFT_NOT_READY"
  return "READY_TO_GENERATE"
}

function defaultBundleFor(family: ProcedureFamily, mappings: CodeMapping[]): string[] {
  const romElite = mappings.find((m) => m.product_label === "ROM Elite Knee Brace")?.canonical_hcpcs || "L1833"
  if (family === "TKA") return [romElite, "L1832", "E0218", "E0143", "E0165", "E0651"]
  if (family === "THA") return ["L1686", "E0218", "E0143", "E0165", "E0651"]
  return []
}

function ruleHitsFor(patient: LitePatient, uploads: LiteUpload[], generated: LiteGenerated[], mappings: CodeMapping[]): RuleHit[] {
  const family = detectProcedureFamily(patient)
  const laterality = detectLaterality(patient)
  const hits: RuleHit[] = []
  const add = (rule_name: string, severity: RuleHit["severity"], message: string, blocking = false) => {
    hits.push({ case_id: patient.id, rule_name, severity, message, blocking })
  }

  if (!(patient.first_name || "").trim() || !(patient.last_name || "").trim()) {
    add("missing_patient_name", "blocking", "Patient full name is required before final generation.", true)
  }
  if (!patient.dob) add("missing_dob", "blocking", "DOB is required before final generation.", true)
  if (!patient.ordering_provider) add("missing_provider", "blocking", "Provider name is required before final generation.", true)
  if (!patient.diagnosis_codes?.length) add("missing_diagnosis", "blocking", "At least one diagnosis is required.", true)
  if (!patient.payer_name) add("missing_payer", "warning", "Primary payer is missing; payer addendum drafting should remain blocked.")
  if (family !== "other" && laterality === "unknown") {
    add("missing_laterality", "blocking", "Laterality is required for laterality-dependent arthroplasty items.", true)
  }
  if (!uploads.length) add("missing_source_documents", "warning", "No source PDFs uploaded for OCR/classification review.")
  if (family === "other") add("unclassified_procedure", "warning", "Procedure family is still unknown; bundle proposal remains conservative.")

  const conflictMapping = mappings.find((mapping) => mapping.conflict && mapping.requires_review)
  if (family === "TKA" && conflictMapping) {
    add(
      "code_conflict_rom_elite",
      "blocking",
      `${conflictMapping.product_label} has conflicting HCPCS mappings (${[conflictMapping.canonical_hcpcs, ...conflictMapping.alternatives].join(", ")}). Human confirmation is required.`,
      true,
    )
  }

  const hasSwo = generated.some((doc) => doc.document_type === "swo")
  const hasAddendum = generated.some((doc) => doc.document_type === "transmittal" || doc.document_type === "checklist")
  if (!hasSwo) add("missing_swo_draft", "warning", "SWO draft has not been generated yet.")
  if (!hasAddendum) add("missing_addendum_draft", "warning", "No payer addendum-style draft has been generated yet.")

  return hits
}

function extractionFieldsFor(patient: LitePatient, uploads: LiteUpload[]): ExtractionField[] {
  const primarySource = uploads[0]
  const source_document_id = primarySource?.id || null
  const source_page = primarySource ? 1 : null
  const source = (
    field_name: string,
    field_value: string | null,
    extraction_method: ExtractionField["extraction_method"] = "manual_record",
  ): ExtractionField => ({
    case_id: patient.id,
    field_name,
    field_value,
    confidence: field_value ? 0.92 : 0.0,
    source_document_id,
    source_page,
    extraction_method,
    requires_review: !field_value,
  })
  return [
    source("patient_first_name", patient.first_name || null),
    source("patient_last_name", patient.last_name || null),
    source("dob", patient.dob),
    source("phone", patient.phone),
    source("address", patient.address),
    source("primary_insurance", patient.payer_name),
    source("member_id_primary", patient.member_id),
    source("provider_name", patient.ordering_provider),
    source("procedure_family", detectProcedureFamily(patient), "inferred"),
    source("laterality", detectLaterality(patient), "inferred"),
    source("diagnosis_codes", patient.diagnosis_codes.join(", ") || null),
    source("recommended_bundle", defaultBundleFor(detectProcedureFamily(patient), getCodeMappings()).join(", ") || null, "inferred"),
  ]
}

function generatedDocType(doc: LiteGenerated): TridentGeneratedDocument["type"] {
  if (doc.document_type === "swo") return "SWO"
  if (doc.document_type === "transmittal" || doc.document_type === "checklist" || doc.document_type === "billing-summary") {
    return "ADDENDUM"
  }
  return "OTHER"
}

function mapGenerated(doc: LiteGenerated): TridentGeneratedDocument {
  return {
    id: doc.id,
    case_id: doc.patient_id,
    type: generatedDocType(doc),
    template_version: String(doc.metadata?.template_version || "2026.04"),
    rendered_html: doc.content,
    rendered_pdf_path: doc.file_path,
    json_payload: {
      source_type: doc.document_type,
      metadata: doc.metadata,
    },
    status: "draft",
    created_at: doc.created_at,
  }
}

function splitAddress(address: string | null): { address_1: string | null; address_2: string | null; city: string | null; state: string | null; zip: string | null } {
  if (!address) return { address_1: null, address_2: null, city: null, state: null, zip: null }
  return { address_1: address, address_2: null, city: null, state: null, zip: null }
}

export function mapLiteCaseSummary(patient: LitePatient, generated: LiteGenerated[], mappings = getCodeMappings()): TridentCaseSummary {
  const rule_hits = ruleHitsFor(patient, [], generated, mappings)
  return {
    id: patient.id,
    status: inferReviewState(rule_hits),
    patient_first_name: patient.first_name,
    patient_last_name: patient.last_name,
    dob: patient.dob,
    primary_insurance: patient.payer_name,
    provider_name: patient.ordering_provider,
    procedure_family: detectProcedureFamily(patient),
    laterality: detectLaterality(patient),
    review_flags: rule_hits.map((hit) => hit.message),
    generated_documents: generated.map(mapGenerated),
  }
}

export function mapLiteCaseDetail(patient: LitePatient, uploads: LiteUpload[], generated: LiteGenerated[], mappings = getCodeMappings()): TridentCaseDetail {
  const procedure_family = detectProcedureFamily(patient)
  const laterality = detectLaterality(patient)
  const rule_hits = ruleHitsFor(patient, uploads, generated, mappings)
  const { address_1, address_2, city, state, zip } = splitAddress(patient.address)
  const diagnosis_text = patient.diagnosis_codes.length ? patient.diagnosis_codes : []
  const dvt_risk_factors = patient.notes?.match(/\b(dvt|fall risk|reduced mobility|bedrest|anesthesia)\b/gi) || []
  const dvt_risk_score = dvt_risk_factors.length ? dvt_risk_factors.length : null
  const generated_documents = generated.map(mapGenerated)
  return {
    id: patient.id,
    status: inferReviewState(rule_hits),
    patient_first_name: patient.first_name,
    patient_last_name: patient.last_name,
    dob: patient.dob,
    sex: null,
    phone: patient.phone,
    address_1,
    address_2,
    city,
    state,
    zip,
    primary_insurance: patient.payer_name,
    secondary_insurance: null,
    member_id_primary: patient.member_id,
    member_id_secondary: null,
    procedure_name: procedure_family === "TKA" ? "Total Knee Arthroplasty" : procedure_family === "THA" ? "Total Hip Arthroplasty" : null,
    procedure_family,
    laterality,
    surgery_date: null,
    order_date: null,
    bmi: null,
    provider_name: patient.ordering_provider,
    provider_npi: null,
    facility_name: null,
    diagnosis_codes: patient.diagnosis_codes,
    diagnosis_text,
    dvt_risk_factors,
    dvt_risk_score,
    mobility_limitation_present: /\b(mobility|walker|gait|transfer)\b/i.test(patient.notes || ""),
    fall_risk_present: /\b(fall risk|falls?)\b/i.test(patient.notes || ""),
    review_flags: rule_hits.map((hit) => hit.message),
    source_documents: uploads,
    generated_documents,
    extracted_fields: extractionFieldsFor(patient, uploads),
    rule_hits,
    internal_export_json: {
      patient: {
        id: patient.id,
        first_name: patient.first_name,
        last_name: patient.last_name,
        dob: patient.dob,
      },
      diagnoses: patient.diagnosis_codes,
      items: defaultBundleFor(procedure_family, mappings),
      references: {
        swo_document_id: generated_documents.find((doc) => doc.type === "SWO")?.id || null,
        addendum_document_ids: generated_documents.filter((doc) => doc.type === "ADDENDUM").map((doc) => doc.id),
      },
      halcyon_preparation: {
        status: "disabled_in_this_phase",
      },
    },
    code_mappings: mappings,
    templates: getTemplates(),
  }
}

async function parseJson<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) return fallback
  try {
    return (await res.json()) as T
  } catch {
    return fallback
  }
}

export async function listTridentCases(query?: string): Promise<TridentCaseSummary[]> {
  const qs = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""
  const patients = await parseJson<LitePatient[]>(await liteServerFetch(`/patients${qs}`), [])
  const mappings = getCodeMappings()
  const generatedByCase = new Map<string, LiteGenerated[]>()
  await Promise.all(
    patients.slice(0, 50).map(async (patient) => {
      const generated = await parseJson<LiteGenerated[]>(
        await liteServerFetch(`/patients/${patient.id}/generated`),
        [],
      )
      generatedByCase.set(patient.id, generated)
    }),
  )
  return patients.map((patient) => mapLiteCaseSummary(patient, generatedByCase.get(patient.id) || [], mappings))
}

export async function getTridentCaseDetail(caseId: string): Promise<TridentCaseDetail | null> {
  const [patientRes, uploadsRes, generatedRes] = await Promise.all([
    liteServerFetch(`/patients/${caseId}`),
    liteServerFetch(`/patients/${caseId}/documents`),
    liteServerFetch(`/patients/${caseId}/generated`),
  ])
  if (!patientRes.ok) return null
  const patient = await patientRes.json() as LitePatient
  const uploads = await parseJson<LiteUpload[]>(uploadsRes, [])
  const generated = await parseJson<LiteGenerated[]>(generatedRes, [])
  return mapLiteCaseDetail(patient, uploads, generated)
}

export async function listTridentGeneratedDocs(): Promise<TridentGeneratedDocument[]> {
  const cases = await listTridentCases()
  return cases.flatMap((tridentCase) => tridentCase.generated_documents)
}
