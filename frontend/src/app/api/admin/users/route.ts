import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

function adminUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

function canManageUsers(session: any) {
  return Boolean(
    session?.user?.accessToken &&
      (session.user.role === "admin" || (session.user.permissions || []).includes("manage_users")),
  )
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!canManageUsers(session)) {
    return adminUnauthorized()
  }

  const res = await fetch(`${CORE_API_URL}/api/v1/admin/users`, {
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })

  const data = await res.json().catch(() => ({ error: "Upstream error" }))
  return NextResponse.json(data, { status: res.status })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!canManageUsers(session)) {
    return adminUnauthorized()
  }

  const body = await req.json()
  const res = await fetch(`${CORE_API_URL}/api/v1/admin/users`, {
    method: "POST",
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
