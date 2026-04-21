import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { correlationHeaders, internalApiKeyHeaders } from "@/lib/proxy-headers"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const TRIDENT_API_URL = getServiceBaseUrl("TRIDENT_API_URL")

/**
 * POST /api/trident/score — proxy to Trident POST /api/v1/trident/score (canonical denial / learned signal).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const res = await fetch(`${TRIDENT_API_URL}/api/v1/trident/score`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...internalApiKeyHeaders(),
      ...correlationHeaders(req.headers),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json(
      {
        error: "UpstreamUnavailable",
        message: "Unable to reach Trident service",
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
