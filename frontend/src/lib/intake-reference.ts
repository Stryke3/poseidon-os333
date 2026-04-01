export type IntakePayerOption = {
  id: string
  name: string
}

export type IntakeIcd10Option = {
  code: string
  description: string
}

export const PAYER_OPTIONS: IntakePayerOption[] = [
  { id: "MEDICARE_DMERC", name: "Medicare DMERC" },
  { id: "UHC", name: "UnitedHealthcare" },
  { id: "AETNA", name: "Aetna" },
  { id: "BCBS", name: "Blue Cross Blue Shield" },
  { id: "CIGNA", name: "Cigna" },
  { id: "HUMANA", name: "Humana" },
  { id: "MEDICAID", name: "Medicaid" },
  { id: "ANTHEM", name: "Anthem" },
  { id: "MOLINA", name: "Molina Healthcare" },
  { id: "CENTENE", name: "Centene" },
  { id: "WELLCARE", name: "WellCare" },
  { id: "CARESOURCE", name: "CareSource" },
  { id: "OSCAR", name: "Oscar Health" },
  { id: "AMBETTER", name: "Ambetter" },
  { id: "TRICARE", name: "TRICARE" },
  { id: "VA", name: "Veterans Affairs" },
  { id: "KAISER", name: "Kaiser Permanente" },
  { id: "MAGELLAN", name: "Magellan Health" },
  { id: "CHAMP_VA", name: "ChampVA" },
]

export const ICD10_OPTIONS: IntakeIcd10Option[] = [
  { code: "Z33.1", description: "Pregnant state, incidental" },
  { code: "M54.50", description: "Low back pain, unspecified" },
  { code: "M54.16", description: "Radiculopathy, lumbar region" },
  { code: "M17.11", description: "Unilateral primary osteoarthritis, right knee" },
  { code: "M17.12", description: "Unilateral primary osteoarthritis, left knee" },
  { code: "M17.0", description: "Bilateral primary osteoarthritis of knee" },
  { code: "M25.561", description: "Pain in right knee" },
  { code: "M25.562", description: "Pain in left knee" },
  { code: "M48.06", description: "Spinal stenosis, lumbar region" },
  { code: "M47.816", description: "Spondylosis without myelopathy or radiculopathy, lumbar region" },
  { code: "G89.4", description: "Chronic pain syndrome" },
  { code: "G47.33", description: "Obstructive sleep apnea" },
  { code: "J44.9", description: "Chronic obstructive pulmonary disease, unspecified" },
  { code: "J96.11", description: "Chronic respiratory failure with hypoxia" },
  { code: "R09.02", description: "Hypoxemia" },
  { code: "I50.9", description: "Heart failure, unspecified" },
  { code: "I89.0", description: "Lymphedema, not elsewhere classified" },
  { code: "R26.2", description: "Difficulty in walking, not elsewhere classified" },
  { code: "R26.81", description: "Unsteadiness on feet" },
  { code: "R53.1", description: "Weakness" },
  { code: "Z74.09", description: "Other reduced mobility" },
  { code: "Z99.3", description: "Dependence on wheelchair" },
  { code: "Z99.81", description: "Dependence on supplemental oxygen" },
]

function normalize(value: string) {
  return value.trim().toLowerCase()
}

export function searchPayers(query: string, limit = 8) {
  const q = normalize(query)
  if (!q) return PAYER_OPTIONS.slice(0, limit)
  return PAYER_OPTIONS.filter((payer) => {
    const id = payer.id.toLowerCase()
    const name = payer.name.toLowerCase()
    return id.includes(q) || name.includes(q)
  }).slice(0, limit)
}

export function searchIcd10(query: string, limit = 8) {
  const q = normalize(query)
  if (!q) return ICD10_OPTIONS.slice(0, limit)
  return ICD10_OPTIONS.filter((item) => {
    const code = item.code.toLowerCase()
    const description = item.description.toLowerCase()
    return code.includes(q) || description.includes(q)
  }).slice(0, limit)
}
