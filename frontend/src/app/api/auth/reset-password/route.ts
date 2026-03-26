import { NextRequest, NextResponse } from "next/server"

const CORE_API_URL =
  process.env.POSEIDON_API_URL || process.env.CORE_API_URL || "http://poseidon_core:8001"

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, ...payload } = body as { action: string; [key: string]: unknown }

  const endpoint =
    action === "reset"
      ? "/auth/reset-password"
      : "/auth/request-reset"

  const res = await fetch(`${CORE_API_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json(
      { status: "error", message: "Unable to reach authentication service." },
      { status: 502 },
    )
  }

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
