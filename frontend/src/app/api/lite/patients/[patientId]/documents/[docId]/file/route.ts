import { NextResponse } from "next/server"

import { getLiteBaseUrl, liteAuthHeaders } from "@/lib/lite-api"

type Ctx = { params: Promise<{ patientId: string; docId: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { patientId, docId } = await ctx.params
  const res = await fetch(`${getLiteBaseUrl()}/patients/${patientId}/documents/${docId}/file`, {
    headers: liteAuthHeaders(),
    cache: "no-store",
  })
  if (!res.ok) {
    const t = await res.text()
    return NextResponse.json({ detail: t }, { status: res.status })
  }
  const ct = res.headers.get("content-type") || "application/octet-stream"
  const cd = res.headers.get("content-disposition") || ""
  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      "Content-Type": ct,
      ...(cd ? { "Content-Disposition": cd } : {}),
    },
  })
}
