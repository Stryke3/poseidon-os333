import { NextResponse } from "next/server"

import { checkAdminGate } from "@/lib/trident-admin-guard"
import { liteServerFetch } from "@/lib/lite-api"

const timeoutMs = 15_000

export async function GET() {
  const gate = await checkAdminGate()
  if (!gate.success) {
    return (gate as any).response
  }
  const res = await liteServerFetch("/reference/admin/payers", {
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json({ error: text || "Lite error" }, { status: res.status >= 400 ? res.status : 502 })
  }
  try {
    return NextResponse.json(JSON.parse(text) as unknown)
  } catch {
    return NextResponse.json({ error: "Invalid Lite response" }, { status: 502 })
  }
}

export async function POST(req: Request) {
  const gate = await checkAdminGate()
  if (!gate.success) {
    return (gate as any).response
  }
  const body = await req.text()
  const res = await liteServerFetch("/reference/admin/payers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json(
      { error: text || "Lite error" },
      { status: res.status >= 400 ? res.status : 502 },
    )
  }
  try {
    return NextResponse.json(JSON.parse(text) as unknown)
  } catch {
    return NextResponse.json({ error: "Invalid Lite response" }, { status: 502 })
  }
}
