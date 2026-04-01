import hcpcsCatalog from "@/generated/hcpcs-catalog.json"

const HCPCS_SHORT_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  (hcpcsCatalog as Array<{ code: string; description: string }>).map((item) => [item.code, item.description]),
)

function titleCase(input: string) {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function getHcpcsShortDescription(code?: string | null) {
  const normalized = String(code || "").trim().toUpperCase()
  if (!normalized) return "Device"
  return HCPCS_SHORT_DESCRIPTIONS[normalized] || normalized
}

export function formatHcpcsLabel(code?: string | null) {
  const normalized = String(code || "").trim().toUpperCase()
  if (!normalized) return "Device"
  const description = getHcpcsShortDescription(normalized)
  return description === normalized ? normalized : `${description} (${normalized})`
}

export function formatHcpcsList(codes?: string[] | null) {
  if (!codes?.length) return "No HCPCS"
  return codes.map((code) => formatHcpcsLabel(code)).join(", ")
}

export function formatDeviceTitle(value?: string | null) {
  const normalized = String(value || "").trim()
  if (!normalized) return "Device"
  if (/^[A-Z]\d{4}$/i.test(normalized)) {
    return getHcpcsShortDescription(normalized)
  }
  return titleCase(normalized.replace(/[_-]+/g, " "))
}
