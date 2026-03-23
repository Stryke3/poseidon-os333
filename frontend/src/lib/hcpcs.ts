const HCPCS_SHORT_DESCRIPTIONS: Record<string, string> = {
  A4253: "Diabetic Test Strips",
  A4595: "TENS Electrodes",
  A6531: "Compression Garment",
  E0260: "Hospital Bed",
  E0470: "BiPAP",
  E0601: "CPAP",
  E0676: "Compression Device",
  E0745: "Neuromuscular Stimulator",
  E0784: "Infusion Pump",
  K0001: "Wheelchair",
  K0005: "Ultralight Wheelchair",
  K0823: "Power Wheelchair",
  K0856: "Power Chair",
  L1686: "Hip Orthosis",
  L1832: "Knee Brace",
  L1833: "Knee Brace",
  L3000: "Foot Orthosis",
}

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
