import { NextResponse } from "next/server"

import { getLiteBaseUrl, liteAuthHeaders } from "@/lib/lite-api"

type Ctx = { params: Promise<{ patientId: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { patientId } = await ctx.params
  const res = await fetch(`${getLiteBaseUrl()}/patients/${patientId}`, {
    headers: liteAuthHeaders(),
    cache: "no-store",
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}

export async function PUT(req: Request, ctx: Ctx) {
  const { patientId } = await ctx.params
  const body = await req.text()
  const res = await fetch(`${getLiteBaseUrl()}/patients/${patientId}`, {
    method: "PUT",
    headers: { ...liteAuthHeaders(), "Content-Type": "application/json" },
    body,
    cache: "no-store",
  })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
