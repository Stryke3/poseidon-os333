import { NextResponse } from "next/server"

import { getTridentAdminSessionOrResponse } from "@/lib/trident-admin-guard"
import { liteServerFetch } from "@/lib/lite-api"

const timeoutMs = 15_000

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await getTridentAdminSessionOrResponse()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  const body = await req.text()
  const res = await liteServerFetch(`/reference/admin/payers/${id}`, {
    method: "PATCH",
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

export async function DELETE(_req: Request, ctx: Ctx) {
  const gate = await getTridentAdminSessionOrResponse()
  if (!gate.ok) return gate.response
  const { id } = await ctx.params
  const res = await liteServerFetch(`/reference/admin/payers/${id}`, {
    method: "DELETE",
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
