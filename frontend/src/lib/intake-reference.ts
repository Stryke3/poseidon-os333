import icd10Catalog from "@/generated/icd10-catalog.json"
import hcpcsCatalog from "@/generated/hcpcs-catalog.json"

export type IntakePayerOption = {
  id: string
  name: string
}

export type IntakeIcd10Option = {
  code: string
  description: string
}

export type IntakeHcpcsOption = {
  code: string
  description: string
  long_description?: string
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

export const ICD10_OPTIONS = icd10Catalog as IntakeIcd10Option[]
export const HCPCS_OPTIONS = hcpcsCatalog as IntakeHcpcsOption[]

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

export function searchHcpcs(query: string, limit = 8) {
  const q = normalize(query)
  if (!q) return HCPCS_OPTIONS.slice(0, limit)
  return HCPCS_OPTIONS.filter((item) => {
    const code = item.code.toLowerCase()
    const description = item.description.toLowerCase()
    const longDescription = (item.long_description || "").toLowerCase()
    return code.includes(q) || description.includes(q) || longDescription.includes(q)
  }).slice(0, limit)
}
