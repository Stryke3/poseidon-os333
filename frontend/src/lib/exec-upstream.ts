/**
 * Server-side helpers for /api/exec/* — Core (8001) + EDI (8006) with session JWT.
 */
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { getRequiredEnv, getServiceBaseUrl } from "@/lib/runtime-config"

export function coreBaseUrl(): string {
  return getServiceBaseUrl("POSEIDON_API_URL")
}

export function ediBaseUrl(): string {
  return getServiceBaseUrl("EDI_API_URL")
}

export function ediInternalKeyHeaders(): Record<string, string> {
  const key =
    process.env.EDI_INTERNAL_API_KEY?.trim() ||
    process.env.INTERNAL_API_KEY?.trim() ||
    getRequiredEnv("INTERNAL_API_KEY")
  return { "X-Internal-API-Key": key }
}

export async function requireAccessToken(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return session?.user?.accessToken ?? null
}
