import { NextResponse } from "next/server"

import { checkAdminGate } from "@/lib/trident-admin-guard"
import { liteServerFetch } from "@/lib/lite-api"

const timeoutMs = 15_000

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await checkAdminGate()
  
  if (!gate.success) {
    return (gate as any).response
  }
  
  const session = gate.session
  const { id } = await ctx.params
  const body = await req.text()
  const res = await liteServerFetch(`/reference/admin/providers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  })
  
  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to update provider", status: res.status },
      { status: res.status }
    )
  }
  
  return NextResponse.json(await res.json())
}
