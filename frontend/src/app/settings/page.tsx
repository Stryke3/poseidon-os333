import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import AdminSettingsConsole from "@/components/admin/AdminSettingsConsole"
import { authOptions } from "@/lib/auth"

const CORE_API_URL =
  process.env.POSEIDON_API_URL || process.env.CORE_API_URL || "http://poseidon_core:8001"

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  const canManageUsers =
    session?.user?.role === "admin" || (session?.user?.permissions || []).includes("manage_users")
  if (!session?.user?.accessToken) {
    redirect("/login")
  }
  if (!canManageUsers) {
    redirect("/intake")
  }

  const res = await fetch(`${CORE_API_URL}/api/v1/admin/users`, {
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Admin settings request failed with status ${res.status}`)
  }

  const initialData = await res.json()

  return <AdminSettingsConsole initialData={initialData} />
}
