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
    logUnauthorizedAttempt("documents_POST")
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
    logChartContainmentFailure("documents_POST", patientId, orderId, "order_not_on_patient_chart")
    return NextResponse.json({ error: "Order not found for this patient" }, { status: 404 })
  }

  const formData = await request.formData()

  const res = await fetch(`${CORE_API_URL}/api/v1/orders/${orderId}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
    },
    body: formData,
  })

  const data = await res.json().catch(() => ({ error: "Upstream error" }))
  return NextResponse.json(data, { status: res.status })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ patientId: string; orderId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    logUnauthorizedAttempt("documents_GET")
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
    logChartContainmentFailure("documents_GET", patientId, orderId, "order_not_on_patient_chart")
    return NextResponse.json({ error: "Order not found for this patient" }, { status: 404 })
  }

  const res = await fetch(`${CORE_API_URL}/api/v1/orders/${orderId}/documents`, {
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })

  const data = await res.json().catch(() => ({ error: "Upstream error" }))
  return NextResponse.json(data, { status: res.status })
}
