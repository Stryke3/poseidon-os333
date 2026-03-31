import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const res = await fetch(`${CORE_API_URL}/users/reps`, {
    headers: { Authorization: `Bearer ${session.user.accessToken}` },
    cache: "no-store",
  }).catch(() => null)
  if (!res) return NextResponse.json({ error: "Service unavailable" }, { status: 502 })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
