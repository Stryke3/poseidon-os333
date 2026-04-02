import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"
import { authOptions } from "@/lib/auth"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const incomingIdem = req.headers.get("Idempotency-Key")?.trim()
  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.user.accessToken}`,
  }
  if (incomingIdem) {
    forwardHeaders["Idempotency-Key"] = incomingIdem.slice(0, 128)
  }

  const res = await fetch(`${CORE_API_URL}/patients`, {
    method: "POST",
    headers: forwardHeaders,
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json(
      { error: "Unable to reach core service" },
      { status: 502 },
    )
  }

  const raw = await res.text().catch(() => "")
  let data: unknown = {}
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = { error: raw.slice(0, 500) }
    }
  }

  return NextResponse.json(data, { status: res.status })
}
