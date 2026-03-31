import { NextRequest, NextResponse } from "next/server"
import { getServiceBaseUrl } from "@/lib/runtime-config"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const coreApiUrl = getServiceBaseUrl("POSEIDON_API_URL")
  const body = await req.json()
  const { action, ...payload } = body as { action: string; [key: string]: unknown }

  const endpoint =
    action === "reset"
      ? "/auth/reset-password"
      : "/auth/request-reset"

  const res = await fetch(`${coreApiUrl}${endpoint}`, {
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
