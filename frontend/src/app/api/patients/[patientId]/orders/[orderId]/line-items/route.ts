import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { logChartContainmentFailure, logUnauthorizedAttempt } from "@/lib/chart-proxy-log"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

export async function POST(
  request: Request,
  { params }: { params: Promise<{ patientId: string; orderId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    logUnauthorizedAttempt("line-items_POST")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { patientId, orderId } = await params

  const chartRes = await fetch(`${CORE_API_URL}/patients/${patientId}/chart`, {
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })
  if (!chartRes.ok) {
    const err = await chartRes.json().catch(() => ({ error: "Upstream error" }))
    return NextResponse.json(err, { status: chartRes.status })
  }
  const chart = (await chartRes.json()) as { orders?: { id?: string }[] }
  const onChart = (chart.orders || []).some((o) => String(o.id) === String(orderId))
  if (!onChart) {
    logChartContainmentFailure("line-items_POST", patientId, orderId, "order_not_on_patient_chart")
    return NextResponse.json({ error: "Order not found for this patient" }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const res = await fetch(`${CORE_API_URL}/api/v1/orders/${orderId}/line-items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({ error: "Upstream error" }))
  return NextResponse.json(data, { status: res.status })
}
