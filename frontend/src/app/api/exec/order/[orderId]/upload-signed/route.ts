import { NextRequest, NextResponse } from "next/server"

import { coreBaseUrl, requireAccessToken } from "@/lib/exec-upstream"
import { correlationHeaders } from "@/lib/proxy-headers"

export async function POST(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const token = await requireAccessToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orderId } = await ctx.params
  const incoming = await req.formData()
  const file = incoming.get("file")
  const docType = (incoming.get("doc_type") as string | null) || "signed_swo"

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected multipart field 'file'" }, { status: 400 })
  }

  const out = new FormData()
  out.append("doc_type", docType)
  out.append("file", file, file.name || "signed.pdf")

  const res = await fetch(`${coreBaseUrl()}/api/v1/orders/${orderId}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...correlationHeaders(req.headers),
    },
    body: out,
    cache: "no-store",
  })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
