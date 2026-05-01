const TRUE_VALUES = new Set(["1", "true", "yes", "on"])
const FALSE_VALUES = new Set(["0", "false", "no", "off"])

function readBooleanFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (TRUE_VALUES.has(raw)) return true
  if (FALSE_VALUES.has(raw)) return false
  return fallback
}

export function isTridentPhaseAOnly(): boolean {
  return readBooleanFlag("TRIDENT_PHASE_A_ONLY", true)
}

export function isTrident30Enabled(): boolean {
  return !isTridentPhaseAOnly() && readBooleanFlag("TRIDENT_ENABLE_TRIDENT30", false)
}

const PHASE_A_ALLOWED_API_PREFIXES = [
  "/api/auth",
  "/api/core",
  "/api/health",
  "/api/intake",
  "/api/lite",
  "/api/public-inquiry",
  "/api/trident",
] as const

export function isPhaseAApiPathAllowed(pathname: string): boolean {
  return PHASE_A_ALLOWED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
