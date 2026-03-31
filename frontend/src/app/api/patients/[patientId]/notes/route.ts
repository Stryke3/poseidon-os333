import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

export async function GET(req: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { patientId } = await params
  const res = await fetch(`${CORE_API_URL}/patients/${patientId}/notes`, {
    headers: { Authorization: `Bearer ${session.user.accessToken}` },
    cache: "no-store",
  }).catch(() => null)
  if (!res) return NextResponse.json({ error: "Service unavailable" }, { status: 502 })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { patientId } = await params
  const body = await req.json()
  const res = await fetch(`${CORE_API_URL}/patients/${patientId}/notes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.user.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null)
  if (!res) return NextResponse.json({ error: "Service unavailable" }, { status: 502 })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
