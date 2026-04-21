import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { getAuthClaimsFromRequest, resolveOrgIdFromCore } from "@/lib/auth-from-request"
import { correlationHeaders, internalApiKeyHeaders } from "@/lib/proxy-headers"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const INTAKE_API_URL = getServiceBaseUrl("INTAKE_API_URL")

export async function POST(req: NextRequest) {
  const claims = await getAuthClaimsFromRequest(req)
  if (!claims?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let orgId = claims.orgId?.trim()
  if (!orgId) {
    orgId = (await resolveOrgIdFromCore(claims.accessToken)) ?? ""
  }
  if (!orgId) {
    return NextResponse.json(
      {
        error: "MissingOrganization",
        message:
          "Could not determine organization for this user. Sign out and sign in again, or confirm the Core user has org_id set.",
      },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const incomingIdem = req.headers.get("Idempotency-Key")?.trim()
  const idempotencyKey = incomingIdem?.slice(0, 128) || randomUUID()

  const payload = {
    ...(body as Record<string, unknown>),
    org_id: orgId,
  }

  const res = await fetch(`${INTAKE_API_URL}/api/v1/intake/patient`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      ...internalApiKeyHeaders(),
      ...correlationHeaders(req.headers),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json(
      {
        error: "UpstreamUnavailable",
        message: "Unable to reach intake service",
        upstream: `${INTAKE_API_URL}/api/v1/intake/patient`,
      },
      { status: 502 },
    )
  }

  const raw = await res.text().catch(() => "")
  let data: unknown = {}
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = { error: "InvalidUpstreamResponse", detail: raw.slice(0, 500) }
    }
  }

  return NextResponse.json(data, { status: res.status })
}
