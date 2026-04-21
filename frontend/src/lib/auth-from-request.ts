/**
 * Resolve operator accessToken (+ orgId when present) from NextAuth cookies in Route Handlers.
 * Mirrors the fallbacks used for live ingest: alternate secureCookie, raw Cookie header, getServerSession.
 */
import { headers } from "next/headers"
import type { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { getToken } from "next-auth/jwt"

import { authOptions } from "@/lib/auth"
import { getRequiredEnv, getServiceBaseUrl } from "@/lib/runtime-config"

function reqLikeWithCookie(cookieHeader: string | null): NextRequest {
  const h = new Headers()
  if (cookieHeader) h.set("cookie", cookieHeader)
  return { headers: h } as NextRequest
}

export type AuthClaims = {
  accessToken: string
  orgId?: string
}

/**
 * If JWT/session omits orgId, ask Core who the bearer is (same token the UI uses for APIs).
 */
export async function resolveOrgIdFromCore(accessToken: string): Promise<string | undefined> {
  const base = getServiceBaseUrl("POSEIDON_API_URL")
  const res = await fetch(`${base}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  }).catch(() => null)
  if (!res?.ok) return undefined
  const data = (await res.json().catch(() => ({}))) as { org_id?: string }
  const raw = data.org_id
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined
}

export async function getAuthClaimsFromRequest(req: NextRequest): Promise<AuthClaims | null> {
  const secret = getRequiredEnv("NEXTAUTH_SECRET")
  const urlHttps = process.env.NEXTAUTH_URL?.trim().startsWith("https://") ?? false
  const secureCookie = urlHttps

  let jwtPayload = await getToken({
    req,
    secret,
    secureCookie,
  })

  if (!jwtPayload?.accessToken) {
    jwtPayload = await getToken({
      req,
      secret,
      secureCookie: !secureCookie,
    })
  }

  if (!jwtPayload?.accessToken) {
    const cookieHeader = req.headers.get("cookie") || (await headers()).get("cookie")
    if (cookieHeader) {
      const alt = reqLikeWithCookie(cookieHeader)
      jwtPayload = await getToken({ req: alt, secret, secureCookie })
      if (!jwtPayload?.accessToken) {
        jwtPayload = await getToken({ req: alt, secret, secureCookie: !secureCookie })
      }
    }
  }

  let accessToken: string | undefined =
    typeof jwtPayload?.accessToken === "string" ? jwtPayload.accessToken : undefined
  let orgId: string | undefined =
    typeof jwtPayload?.orgId === "string" ? jwtPayload.orgId.trim() : undefined

  if (!accessToken) {
    const session = await getServerSession(authOptions)
    accessToken =
      typeof session?.user?.accessToken === "string" ? session.user.accessToken : undefined
    if (!orgId && typeof session?.user?.orgId === "string") {
      orgId = session.user.orgId.trim()
    }
  }

  if (!accessToken) return null
  return { accessToken, orgId }
}
