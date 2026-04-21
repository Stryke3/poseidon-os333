import { NextResponse } from "next/server"

import { getLiteBaseUrl, liteAuthHeaders } from "@/lib/lite-api"

type Ctx = { params: Promise<{ patientId: string; genId: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { patientId, genId } = await ctx.params
  const res = await fetch(`${getLiteBaseUrl()}/patients/${patientId}/generated/${genId}`, {
    headers: liteAuthHeaders(),
    cache: "no-store",
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
