import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

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

  const data = await res.json().catch(() => ({ error: "Upstream error" }))
  return NextResponse.json(data, { status: res.status })
}
