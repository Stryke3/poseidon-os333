import { getServerSession } from "next-auth"
import { NextRequest } from "next/server"

import { authOptions } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE = getServiceBaseUrl("POSEIDON_API_URL")

export async function PATCH(req: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const nextStatus = body?.status
  if (!nextStatus || typeof nextStatus !== "string") {
    return Response.json({ error: "Missing status" }, { status: 400 })
  }

  const res = await fetch(`${CORE}/orders/${orderId}/status?new_status=${encodeURIComponent(nextStatus)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${session.user.accessToken}` },
  })

  const payload = await res.json().catch(() => ({}))
  return Response.json(payload, { status: res.status })
}
