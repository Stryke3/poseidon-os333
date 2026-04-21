/**
 * Helpers for Trident canonical score (POST /api/v1/trident/score) from intake context.
 */

export type TridentScorePayload = {
  icd10_codes: string[]
  hcpcs_codes: string[]
  payer_id: string
  physician_npi?: string
  patient_age: number
  dos?: string
}

export type TridentScoreApiResponse = {
  learned_adjustment?: number
  confidence?: number
  features_used?: string[]
  denial_probability?: number
  medical_necessity_score?: number
  risk_factors?: string[]
  rule_based_probability?: number
  detail?: string
  error?: string
}

export function patientAgeFromIsoDob(dob: string): number {
  const t = Date.parse(dob.includes("T") ? dob : `${dob}T12:00:00`)
  if (Number.isNaN(t)) return 0
  const d = new Date(t)
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age -= 1
  }
  return Math.max(0, age)
}

export function canRequestTridentScore(args: {
  payerId: string
  icd10Codes: string[]
  hcpcsCodes: string[]
}): boolean {
  return (
    Boolean(args.payerId.trim()) &&
    args.icd10Codes.length > 0 &&
    args.hcpcsCodes.length > 0
  )
}

/** Payload merged into `orders.clinical_data.trident_snapshot` (Core PATCH). */
export function buildTridentSnapshotForStorage(score: TridentScoreApiResponse): Record<string, unknown> {
  const { confidenceTier, historyTier } = tridentInterpretation(score)
  return {
    learned_adjustment: score.learned_adjustment ?? null,
    confidence: score.confidence ?? null,
    features_used: score.features_used ?? [],
    denial_probability: score.denial_probability ?? null,
    medical_necessity_score: score.medical_necessity_score ?? null,
    interpretation: `${confidenceTier} · ${historyTier}`,
  }
}

export function tridentInterpretation(score: TridentScoreApiResponse): {
  confidenceTier: string
  historyTier: string
} {
  const c = typeof score.confidence === "number" ? score.confidence : 0
  const features = score.features_used
  const confidenceTier =
    c >= 0.55 ? "High confidence — model trusts this blend" : "Low confidence — sparse or weak historical signal"
  const hasAgg = Array.isArray(features) && features.length > 0
  const historyTier = hasAgg
    ? "Strong history — learned aggregates matched (see features)"
    : "Limited history — no aggregate match for this payer/code mix"
  return { confidenceTier, historyTier }
}
