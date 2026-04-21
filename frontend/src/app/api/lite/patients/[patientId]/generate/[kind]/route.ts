import { NextResponse } from "next/server"

import { getLiteBaseUrl, liteAuthHeaders } from "@/lib/lite-api"

type Ctx = { params: Promise<{ patientId: string; kind: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  const { patientId, kind } = await ctx.params
  const res = await fetch(`${getLiteBaseUrl()}/patients/${patientId}/generate/${kind}`, {
    method: "POST",
    headers: liteAuthHeaders(),
    cache: "no-store",
  })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
