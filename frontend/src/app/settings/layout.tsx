import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import { authOptions } from "@/lib/auth"
import SettingsTabs from "@/components/admin/SettingsTabs"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen text-slate-100">
      <div className="mx-auto w-full max-w-[1680px] px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 xl:px-10">
        <SettingsTabs />
      </div>
      {children}
    </div>
  )
}
