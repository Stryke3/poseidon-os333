import { NextResponse } from "next/server"

import { liteServerFetch } from "@/lib/lite-api"

export async function GET() {
  const res = await liteServerFetch("/reference/payers", { signal: AbortSignal.timeout(8000) })
  const text = await res.text()
  if (!res.ok) {
    return NextResponse.json({ error: text || "Lite unavailable" }, { status: res.status >= 400 ? res.status : 502 })
  }
  try {
    return NextResponse.json(JSON.parse(text) as unknown)
  } catch {
    return NextResponse.json({ error: "Invalid response from Lite" }, { status: 502 })
  }
}
