import { NextRequest, NextResponse } from "next/server"

import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

/**
 * Proxy for Core admin `POST /api/v1/admin/materialize-order-packages`.
 * Used by scripts/lvco_live_pipeline.py when `CORE_BASE_URL` is the dashboard `/api/core` edge.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization")?.trim() || ""
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 })
  }

  const incoming = new URL(req.url)
  const target = `${CORE_API_URL}/api/v1/admin/materialize-order-packages${incoming.search}`

  const rawBody = await req.text()
  const res = await fetch(target, {
    method: "POST",
    headers: rawBody
      ? { Authorization: auth, "Content-Type": "application/json" }
      : { Authorization: auth },
    ...(rawBody ? { body: rawBody } : {}),
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json({ detail: "Unable to reach Core" }, { status: 502 })
  }

  const payload = await res.json().catch(() => ({}))
  return NextResponse.json(payload, { status: res.status })
}
