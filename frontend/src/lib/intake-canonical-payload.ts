/**
 * Maps dashboard intake form state → Intake service POST /api/v1/intake/patient body
 * (org_id is injected server-side by the BFF).
 */

export type IntakeFormLike = {
  first_name: string
  last_name: string
  dob: string
  phone: string
  email: string
  payer_id: string
  insurance_id: string
  icd10_codes: string
  hcpcs_codes: string
  device_description: string
  referring_npi: string
  insurance_auth_number: string
  priority: string
  doctor_name: string
  doctor_phone: string
  doctor_fax: string
  doctor_email: string
  notes: string
  /** Optional street line (e.g. fax OCR) */
  address_line1?: string
}

export type CanonicalIntakeBuildOptions = {
  /** Forwarded to Intake service for low-OCR → review queue behavior */
  parse_confidence?: number | null
  /** `order.source` in Intake payload (default manual_intake) */
  orderSource?: string
}

export type PayerOptionLike = { id: string; name: string }

export function resolvePayerName(payerId: string, payers: PayerOptionLike[]): string {
  const id = payerId.trim()
  if (!id) return ""
  const hit = payers.find((p) => p.id === id)
  return (hit?.name || id).trim()
}

function splitDoctorName(name: string | undefined): { first?: string; last?: string } {
  if (!name?.trim()) return {}
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { last: parts[0] }
  return { first: parts[0], last: parts.slice(1).join(" ") }
}

/**
 * Builds JSON body for Intake canonical patient intake (minus org_id).
 */
export function buildCanonicalIntakePatientBody(
  form: IntakeFormLike,
  icd10Codes: string[],
  hcpcsCodes: string[],
  payerOptions: PayerOptionLike[],
  buildOptions?: CanonicalIntakeBuildOptions,
): Record<string, unknown> {
  const payerName = resolvePayerName(form.payer_id, payerOptions)
  const hasPayerHint = Boolean(form.payer_id.trim() || form.insurance_id.trim())

  const insurance = hasPayerHint
    ? {
        payer_name: payerName || form.payer_id.trim() || "UNKNOWN",
        payer_id: form.payer_id.trim() || undefined,
        member_id: form.insurance_id.trim() || undefined,
      }
    : undefined

  const npi = form.referring_npi.trim()
  const docParts = splitDoctorName(form.doctor_name)
  const physician = npi
    ? {
        npi,
        first_name: docParts.first,
        last_name: docParts.last,
        phone: form.doctor_phone.trim() || undefined,
        fax: form.doctor_fax.trim() || undefined,
        facility_name: undefined,
      }
    : undefined

  const line_items = hcpcsCodes.map((code) => ({
    hcpcs_code: code,
    quantity: 1,
    description: form.device_description.trim() || undefined,
  }))
  const diagnoses = icd10Codes.map((code, i) => ({
    icd10_code: code,
    is_primary: i === 0,
    sequence: i + 1,
  }))

  const order: Record<string, unknown> = {
    source: buildOptions?.orderSource || "manual_intake",
    priority: form.priority || "standard",
    vertical: "dme",
    product_category: form.device_description.trim() || "manual-intake",
    clinical_notes: form.notes.trim() || undefined,
    line_items,
    diagnoses,
    clinical_data: {
      insurance_auth_number: form.insurance_auth_number.trim() || undefined,
      provider_contact: {
        name: form.doctor_name.trim() || null,
        phone: form.doctor_phone.trim() || null,
        fax: form.doctor_fax.trim() || null,
        email: form.doctor_email.trim() || null,
        npi: npi || null,
      },
    },
  }

  const out: Record<string, unknown> = {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    date_of_birth: form.dob.trim(),
    phone: form.phone.trim() || undefined,
    email: form.email.trim() || undefined,
    address_line1: form.address_line1?.trim() || undefined,
    insurance,
    physician,
    order,
  }
  if (
    buildOptions?.parse_confidence !== undefined &&
    buildOptions.parse_confidence !== null &&
    typeof buildOptions.parse_confidence === "number"
  ) {
    out.parse_confidence = buildOptions.parse_confidence
  }
  return out
}

/** Map fax OCR intake panel fields → IntakeFormLike (shared with /intake/new builder). */
export function faxIntakeToFormLike(f: {
  firstName: string
  lastName: string
  dob: string
  insuranceId: string
  payerId: string
  icd10Codes: string
  hcpcsCodes: string
  physicianNpi: string
  phone: string
  address: string
}): IntakeFormLike {
  return {
    first_name: f.firstName,
    last_name: f.lastName,
    dob: f.dob,
    phone: f.phone,
    email: "",
    payer_id: f.payerId,
    insurance_id: f.insuranceId,
    icd10_codes: f.icd10Codes,
    hcpcs_codes: f.hcpcsCodes,
    device_description: "",
    referring_npi: f.physicianNpi,
    insurance_auth_number: "",
    priority: "standard",
    doctor_name: "",
    doctor_phone: "",
    doctor_fax: "",
    doctor_email: "",
    notes: "",
    address_line1: f.address,
  }
}

/** User-facing summary for Intake canonical POST JSON response */
export function formatIntakeCanonicalResult(data: Record<string, unknown>): string {
  const idem = Boolean(data.idempotent_replay)
  const review = Boolean(data.review_queued)
  const orderId = typeof data.order_id === "string" ? data.order_id : null
  const patientId = typeof data.patient_id === "string" ? data.patient_id : null

  if (idem && orderId) {
    return "Patient intake — duplicate request (order already recorded)."
  }
  if (idem && !orderId && patientId) {
    return "Patient intake — duplicate request (already recorded / queued for review)."
  }
  if (review) {
    return "Patient created; additional information required — queued for review."
  }
  if (orderId && patientId) {
    return `Patient created and order created (${orderId.slice(0, 8)}).`
  }
  if (patientId) {
    return `Patient created (${patientId.slice(0, 8)}).`
  }
  return "Intake submitted."
}
