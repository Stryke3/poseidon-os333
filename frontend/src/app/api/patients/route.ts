import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

export async function POST(req: NextRequest) {
  const token = await getToken({ req })
  if (!token?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()

  const res = await fetch(`${CORE_API_URL}/patients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.accessToken}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    return NextResponse.json(
      { error: "Unable to reach core service" },
      { status: 502 },
    )
  }

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
