import { getServerSession } from "next-auth"
import { NextRequest } from "next/server"

import { authOptions } from "@/lib/auth"

const CORE = process.env.CORE_API_URL || process.env.POSEIDON_API_URL || "http://poseidon_core:8001"

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
