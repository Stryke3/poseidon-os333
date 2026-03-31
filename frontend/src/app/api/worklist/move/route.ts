import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

const COLUMN_TO_STATUS: Record<string, string> = {
  pendingAuth: "pending_auth",
  authorized: "authorized",
  submitted: "submitted",
  denied: "denied",
  appealed: "appealed",
  paid: "paid",
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    cardId?: string
    fromCol?: string
    toCol?: string
    orderIds?: string[]
  }

  const targetStatus = body.toCol ? COLUMN_TO_STATUS[body.toCol] : null
  const orderIds = body.orderIds || []

  if (!targetStatus || !orderIds.length) {
    return NextResponse.json(
      { error: "Missing target status or order ids for move." },
      { status: 400 },
    )
  }

  for (const orderId of orderIds) {
    const res = await fetch(
      `${CORE_API_URL}/orders/${orderId}/status?new_status=${targetStatus}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.user.accessToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    )

    if (!res.ok) {
      const errorPayload = await res.json().catch(() => ({}))
      return NextResponse.json(
        {
          error: errorPayload.detail || "Workflow gate blocked this move.",
          orderId,
          cardId: body.cardId,
        },
        { status: res.status },
      )
    }
  }

  return NextResponse.json({ status: "ok", moved: orderIds.length })
}
