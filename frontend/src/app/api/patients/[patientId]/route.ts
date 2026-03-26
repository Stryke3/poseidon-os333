import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"

const CORE_API_URL =
  process.env.POSEIDON_API_URL || process.env.CORE_API_URL || "http://poseidon_core:8001"

/** GET /api/patients/:patientId — fetch a single patient record */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> },
) {
  const token = await getToken({ req })
  if (!token?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { patientId } = await params

  const res = await fetch(`${CORE_API_URL}/patients/${patientId}`, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
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
  const token = await getToken({ req })
  if (!token?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { patientId } = await params
  const body = await req.json()

  const res = await fetch(`${CORE_API_URL}/patients/${patientId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.accessToken}`,
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
