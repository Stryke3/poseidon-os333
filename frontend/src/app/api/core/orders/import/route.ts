import { NextRequest, NextResponse } from "next/server"

import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

/**
 * Authenticated proxy for Core `POST /orders/import`.
 * Requires the same headers as Core: Bearer JWT + X-Internal-API-Key.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization")?.trim() || ""
  const internalKey = req.headers.get("x-internal-api-key")?.trim() || ""

  if (!auth.toLowerCase().startsWith("bearer ") || !internalKey) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 })
  }

  const rawBody = await req.text()
  if (!rawBody) {
    return NextResponse.json({ detail: "Empty body" }, { status: 400 })
  }

  const res = await fetch(`${CORE_API_URL}/orders/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
      "X-Internal-API-Key": internalKey,
    },
    body: rawBody,
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json({ detail: "Unable to reach Core" }, { status: 502 })
  }

  const payload = await res.json().catch(() => ({}))
  return NextResponse.json(payload, { status: res.status })
}
