import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import {
  cleanClaimPctFromOrders,
  mapCommunicationsToEvents,
  mapOrderToRevenuePatient,
} from "@/lib/revenue-command-map"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const headers = {
    Authorization: `Bearer ${session.user.accessToken}`,
    "Content-Type": "application/json",
  }

  const [ordersRes, commRes] = await Promise.all([
    fetch(`${CORE_API_URL}/orders?limit=200`, { headers, cache: "no-store" }).catch(() => null),
    fetch(`${CORE_API_URL}/communications/feed?limit=40`, { headers, cache: "no-store" }).catch(() => null),
  ])

  if (!ordersRes?.ok) {
    const status = ordersRes?.status === 401 || ordersRes?.status === 403 ? 401 : 502
    return NextResponse.json(
      { error: "Unable to load orders", patients: [], events: [], meta: { cleanClaimPct: 0 } },
      { status },
    )
  }

  const ordersPayload = (await ordersRes.json()) as { orders?: Record<string, unknown>[] }
  const orders = ordersPayload.orders || []
  const patients = orders.map(mapOrderToRevenuePatient)

  const commPayload =
    commRes && commRes.ok ? ((await commRes.json()) as { items?: Record<string, unknown>[] }) : null
  const events = mapCommunicationsToEvents(commPayload?.items || [], 1)

  return NextResponse.json({
    patients,
    events,
    meta: { cleanClaimPct: cleanClaimPctFromOrders(orders) },
  })
}
