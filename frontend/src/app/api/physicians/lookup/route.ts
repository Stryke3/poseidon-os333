import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const npi = req.nextUrl.searchParams.get("npi")?.trim() || ""
  if (!/^\d{10}$/.test(npi)) {
    return NextResponse.json({ error: "NPI must be 10 digits." }, { status: 400 })
  }

  const res = await fetch(`${CORE_API_URL}/reference/physicians/lookup?npi=${encodeURIComponent(npi)}`, {
    headers: { Authorization: `Bearer ${session.user.accessToken}` },
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json({ error: "Unable to reach core service" }, { status: 502 })
  }

  const payload = await res.json().catch(() => ({}))
  return NextResponse.json(payload, { status: res.status })
}
