import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { correlationHeaders, internalApiKeyHeaders } from "@/lib/proxy-headers"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE = getServiceBaseUrl("POSEIDON_API_URL")

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orderId } = await params
  const body = await req.json().catch(() => ({}))

  const res = await fetch(`${CORE}/workflow/orders/${encodeURIComponent(orderId)}/advance-from-intake`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
      ...internalApiKeyHeaders(),
      ...correlationHeaders(req.headers),
    },
    body: JSON.stringify({
      auto_request_swo: Boolean((body as { auto_request_swo?: unknown }).auto_request_swo),
    }),
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json({ error: "Unable to reach Core workflow service" }, { status: 502 })
  }

  const text = await res.text().catch(() => "")
  let payload: unknown = {}
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { error: text.slice(0, 500) }
    }
  }

  return NextResponse.json(payload, { status: res.status })
}
