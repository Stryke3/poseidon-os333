import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"

const INTAKE_API_URL =
  process.env.INTAKE_API_URL || "http://poseidon_intake:8003"

export async function POST(req: NextRequest) {
  const token = await getToken({ req })
  if (!token?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const upstream = new FormData()
  upstream.append("file", file)

  const res = await fetch(`${INTAKE_API_URL}/api/v1/intake/parse-document`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.accessToken}` },
    body: upstream,
  }).catch(() => null)

  if (!res) {
    return NextResponse.json(
      { error: "Unable to reach intake service" },
      { status: 502 },
    )
  }

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
