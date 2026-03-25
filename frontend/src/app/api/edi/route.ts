import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"

const EDI_API_URL =
  process.env.EDI_API_URL || "http://poseidon_edi:8006"

/**
 * GET  /api/edi?path=/api/v1/remittance/stats&days=30
 * POST /api/edi  { path: "/api/v1/claims/submit/abc", body: {...} }
 *
 * Generic proxy to the EDI service. The `path` query/body param
 * is appended to EDI_API_URL. Auth is forwarded from session.
 */

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const path = searchParams.get("path") || "/health"
  const qs = new URLSearchParams()
  searchParams.forEach((v, k) => {
    if (k !== "path") qs.set(k, v)
  })
  const query = qs.toString() ? `?${qs.toString()}` : ""

  try {
    const res = await fetch(`${EDI_API_URL}${path}${query}`, {
      headers: {
        Authorization: `Bearer ${session.user.accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json(
      { error: "EDI service unavailable" },
      { status: 502 },
    )
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const path = (body as Record<string, string>).path || "/health"
  const payload = (body as Record<string, unknown>).body

  try {
    const res = await fetch(`${EDI_API_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.user.accessToken}`,
        "Content-Type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json(
      { error: "EDI service unavailable" },
      { status: 502 },
    )
  }
}
