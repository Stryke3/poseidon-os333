import { getServerSession } from "next-auth"
import { NextRequest } from "next/server"

import { authOptions } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE = getServiceBaseUrl("POSEIDON_API_URL")

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = req.nextUrl.searchParams.toString()
  const target = `${CORE}/api/v1/orders${params ? `?${params}` : ""}`
  const res = await fetch(target, {
    headers: { Authorization: `Bearer ${session.user.accessToken}` },
    cache: "no-store",
  })

  const payload = await res.json().catch(() => ({}))
  return Response.json(payload, { status: res.status })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const res = await fetch(`${CORE}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return Response.json({ error: "Unable to reach core service" }, { status: 502 })
  }

  const raw = await res.text().catch(() => "")
  let payload: unknown = {}
  if (raw) {
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = { error: raw.slice(0, 500) }
    }
  }
  return Response.json(payload, { status: res.status })
}
