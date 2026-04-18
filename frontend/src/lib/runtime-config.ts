type EnvironmentName = "development" | "test" | "production"

const ENV_ALIASES: Record<string, string[]> = {
  POSEIDON_API_URL: ["CORE_API_URL"],
}

function currentEnvironment(): EnvironmentName {
  const raw = (process.env.NODE_ENV || "development").toLowerCase()
  if (raw === "production") return "production"
  if (raw === "test") return "test"
  return "development"
}

function isDisallowedHost(value: string) {
  return /(^|:\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/i.test(value)
}

function isProductionRuntime() {
  return (
    currentEnvironment() === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  )
}

export function getRequiredEnv(name: string): string {
  const candidates = [name, ...(ENV_ALIASES[name] || [])]
  for (const candidate of candidates) {
    const value = process.env[candidate]?.trim()
    if (value) {
      return value
    }
  }
  if (!candidates.length) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  throw new Error(`Missing required environment variable: ${candidates.join(" or ")}`)
}

export function getServiceBaseUrl(name: string): string {
  const value = getRequiredEnv(name).replace(/\/$/, "")
  // Server-side calls to Core on loopback are valid for local / Docker Desktop. Opt in to strict
  // checks for public deployments: POSEIDON_ENFORCE_NO_LOCALHOST=true
  if (
    isProductionRuntime() &&
    isDisallowedHost(value) &&
    process.env.POSEIDON_ENFORCE_NO_LOCALHOST === "true"
  ) {
    throw new Error(
      `Environment variable ${name} cannot use localhost in production when POSEIDON_ENFORCE_NO_LOCALHOST is set.`,
    )
  }
  return value
}
