import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

function canManageUsers(session: any) {
  return Boolean(
    session?.user?.accessToken &&
      (session.user.role === "admin" || (session.user.permissions || []).includes("manage_users")),
  )
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!canManageUsers(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { userId } = await context.params
  const body = await req.json()
  const res = await fetch(`${CORE_API_URL}/api/v1/admin/users/${userId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  })

  const data = await res.json().catch(() => ({ error: "Upstream error" }))
  return NextResponse.json(data, { status: res.status })
}
