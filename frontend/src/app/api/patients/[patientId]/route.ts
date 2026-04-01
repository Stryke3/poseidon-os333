import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"
import { authOptions } from "@/lib/auth"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

/** GET /api/patients/:patientId — fetch a single patient record */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { patientId } = await params

  const res = await fetch(`${CORE_API_URL}/patients/${patientId}`, {
    headers: { Authorization: `Bearer ${session.user.accessToken}` },
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json({ error: "Unable to reach core service" }, { status: 502 })
  }

  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}

/** PATCH /api/patients/:patientId — update an existing patient record */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { patientId } = await params
  const body = await req.json()

  const res = await fetch(`${CORE_API_URL}/patients/${patientId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.user.accessToken}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json({ error: "Unable to reach core service" }, { status: 502 })
  }

  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}

/** DELETE /api/patients/:patientId — remove a patient and linked duplicate intake records */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { patientId } = await params

  const res = await fetch(`${CORE_API_URL}/patients/${patientId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
    },
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json({ error: "Unable to reach core service" }, { status: 502 })
  }

  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
