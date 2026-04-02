import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

type ChartOrderLine = Record<string, unknown> & { order_id?: string }

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ patientId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { patientId } = await params
  const res = await fetch(`${CORE_API_URL}/patients/${patientId}/chart`, {
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })

  const data = (await res.json().catch(() => ({ error: "Upstream error" }))) as Record<string, unknown>
  if (res.ok && data && typeof data === "object" && !("error" in data)) {
    const notes = data.notes
    const devices = data.devices
    const orders = (data.orders as Array<{ id?: string; line_items?: ChartOrderLine[] }> | undefined) ?? []
    let devicesOut: unknown[] = Array.isArray(devices) ? [...devices] : []
    if (!devicesOut.length) {
      const flat: ChartOrderLine[] = []
      for (const o of orders) {
        const oid = String(o.id ?? "")
        for (const li of o.line_items ?? []) {
          if (li && typeof li === "object") {
            flat.push({ ...li, order_id: li.order_id ?? oid })
          }
        }
      }
      devicesOut = flat
    }
    return NextResponse.json(
      {
        ...data,
        notes: Array.isArray(notes) ? notes : [],
        devices: devicesOut,
      },
      { status: res.status },
    )
  }
  return NextResponse.json(data, { status: res.status })
}
