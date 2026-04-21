import { NextResponse } from "next/server"

import { getLiteBaseUrl, liteAuthHeaders } from "@/lib/lite-api"

type Ctx = { params: Promise<{ patientId: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { patientId } = await ctx.params
  const res = await fetch(`${getLiteBaseUrl()}/patients/${patientId}/documents`, {
    headers: liteAuthHeaders(),
    cache: "no-store",
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}

export async function POST(req: Request, ctx: Ctx) {
  const { patientId } = await ctx.params
  const form = await req.formData()
  const res = await fetch(`${getLiteBaseUrl()}/patients/${patientId}/documents`, {
    method: "POST",
    headers: liteAuthHeaders(),
    body: form,
    cache: "no-store",
  })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
