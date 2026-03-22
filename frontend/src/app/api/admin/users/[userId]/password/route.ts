import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"

const CORE_API_URL =
  process.env.POSEIDON_API_URL || process.env.CORE_API_URL || "http://poseidon_core:8001"

function canResetPasswords(session: any) {
  return Boolean(
    session?.user?.accessToken &&
      (
        session.user.role === "admin" ||
        (session.user.permissions || []).includes("reset_passwords")
      ),
  )
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!canResetPasswords(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { userId } = await context.params
  const body = await req.json()
  const res = await fetch(`${CORE_API_URL}/api/v1/admin/users/${userId}/password`, {
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
