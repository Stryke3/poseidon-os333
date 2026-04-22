import { NextRequest, NextResponse } from "next/server"

import { coreBaseUrl, requireAccessToken } from "@/lib/exec-upstream"
import { correlationHeaders } from "@/lib/proxy-headers"

export async function POST(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const token = await requireAccessToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orderId } = await ctx.params
  const res = await fetch(`${coreBaseUrl()}/api/v1/orders/${orderId}/generate/swo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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
