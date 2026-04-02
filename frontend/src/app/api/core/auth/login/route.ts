import { NextRequest, NextResponse } from "next/server"

import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

/**
 * Public edge proxy for Core `POST /auth/login`.
 * Batch tools (e.g. scripts/ingest_lvco.py) set
 * `CORE_BASE_URL=https://<dashboard>/api/core` so login hits Core, not NextAuth.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 })
  }

  const res = await fetch(`${CORE_API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json({ detail: "Unable to reach Core" }, { status: 502 })
  }

  const payload = await res.json().catch(() => ({}))
  return NextResponse.json(payload, { status: res.status })
}
