import { NextRequest, NextResponse } from "next/server"

import { ediBaseUrl, ediInternalKeyHeaders, requireAccessToken } from "@/lib/exec-upstream"
import { correlationHeaders } from "@/lib/proxy-headers"

export async function POST(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const token = await requireAccessToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orderId } = await ctx.params
  const res = await fetch(`${ediBaseUrl()}/api/v1/claims/submit/${orderId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...ediInternalKeyHeaders(),
      ...correlationHeaders(req.headers),
    },
    cache: "no-store",
  })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
