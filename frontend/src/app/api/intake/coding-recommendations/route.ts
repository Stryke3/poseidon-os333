import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const res = await fetch(`${CORE_API_URL}/intake/coding-recommendations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json({ error: "Unable to reach core service" }, { status: 502 })
  }

  const payload = await res.json().catch(() => ({}))
  return NextResponse.json(payload, { status: res.status })
}
