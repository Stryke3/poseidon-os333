const HCPCS_SHORT_DESCRIPTIONS: Record<string, string> = {
  // Supplies
  A4253: "Diabetic Test Strips",
  A4595: "TENS Electrodes",
  A6531: "Compression Garment",
  // DME General
  E0260: "Hospital Bed",
  E0470: "BiPAP",
  E0601: "CPAP",
  E0676: "Compression Device",
  E0745: "Neuromuscular Stimulator",
  E0784: "Infusion Pump",
  // Wheelchair Accessories
  E0950: "Wheelchair Tray",
  E0955: "Wheelchair Headrest",
  E0956: "Lateral Trunk Support",
  E0957: "Medial Knee Support",
  E0960: "Positioning Belt",
  E0973: "Wheelchair Cushion Wide",
  E0981: "Seat Upholstery Replacement",
  E1002: "Power Wheelchair Cushion",
  E1014: "Recline Back",
  E1015: "Shock Absorber",
  E1020: "Residual Limb Support",
  // Power Wheelchair Electronics
  E2300: "Power Standing System",
  E2310: "Electronic Controller",
  E2311: "Proportional Controller",
  E2325: "Sip and Puff Interface",
  E2340: "Seat Elevator",
  E2351: "Seat Tilt",
  E2366: "Power Wheelchair Battery",
  E2368: "Battery Charger",
  // Manual Wheelchairs
  K0001: "Standard Wheelchair",
  K0002: "Standard Hemi Wheelchair",
  K0003: "Lightweight Wheelchair",
  K0004: "High-Strength Lightweight Wheelchair",
  K0005: "Ultralight Wheelchair",
  K0006: "Heavy Duty Wheelchair",
  K0007: "Extra Heavy Duty Wheelchair",
  // Power Wheelchairs
  K0333: "Power Wheelchair Group 2 Pediatric",
  K0823: "Power Wheelchair Group 2 Standard",
  K0824: "Power Wheelchair Group 2 Heavy Duty",
  K0856: "Power Wheelchair Group 3 Standard",
  K0857: "Power Wheelchair Group 3 Heavy Duty",
  K0858: "Power Wheelchair Group 3 Very Heavy Duty",
  K0861: "Power Wheelchair Single Power",
  K0862: "Power Wheelchair Multiple Power",
  K0868: "Power Wheelchair Group 4 Standard",
  K0869: "Power Wheelchair Group 4 Heavy Duty",
  // Tek RMD / Standing Wheelchairs
  K0890: "Tek RMD Power Standing Wheelchair",
  K0891: "Tek RMD Power Standing Heavy Duty",
  // Matia custom line
  L8000: "Tek RMD Matia Power Wheelchair",
  // Orthotics
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
