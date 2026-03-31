import { redirect } from "next/navigation"

import AdminSettingsConsole from "@/components/admin/AdminSettingsConsole"
import { getSafeServerSession } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

export default async function SettingsPage() {
  const coreApiUrl = getServiceBaseUrl("POSEIDON_API_URL")
  const session = await getSafeServerSession()
  const canManageUsers =
    session?.user?.role === "admin" || (session?.user?.permissions || []).includes("manage_users")
  if (!session?.user?.accessToken) {
    redirect("/login")
  }
  if (!canManageUsers) {
    redirect("/intake")
  }

  const res = await fetch(`${coreApiUrl}/api/v1/admin/users`, {
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
