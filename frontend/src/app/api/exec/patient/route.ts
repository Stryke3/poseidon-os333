import { NextRequest, NextResponse } from "next/server"

import { coreBaseUrl, requireAccessToken } from "@/lib/exec-upstream"
import { correlationHeaders } from "@/lib/proxy-headers"

export async function POST(req: NextRequest) {
  const token = await requireAccessToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.text()
  const res = await fetch(`${coreBaseUrl()}/api/v1/patients`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...correlationHeaders(req.headers),
    },
    body,
    cache: "no-store",
  })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
