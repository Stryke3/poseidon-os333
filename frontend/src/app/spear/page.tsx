import { redirect } from "next/navigation"
import { SpearCommand } from "@/components/spear/SpearCommand"
import { SpearShellLayout } from "@/components/spear/SpearShellLayout"
import { getSpearCommandData } from "@/lib/spear-command"
import { getSafeServerSession } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function SpearCommandPage() {
  const session = await getSafeServerSession()
  
  if (!session?.user?.accessToken) {
    redirect("/login?callbackUrl=/spear")
  }

  const commandData = await getSpearCommandData()

  return (
    <SpearShellLayout>
      <SpearCommand initialData={commandData} />
    </SpearShellLayout>
  )
}
