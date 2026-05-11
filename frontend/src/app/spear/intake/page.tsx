import { redirect } from "next/navigation"
import IntakeQueueSurface from "@/components/spear/intake/IntakeQueueSurface"
import { SpearShellLayout } from "@/components/spear/SpearShellLayout"
import { getSafeServerSession } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function SpearIntakePage() {
  const session = await getSafeServerSession()
  
  if (!session?.user?.accessToken) {
    redirect("/login?callbackUrl=/spear/intake")
  }

  return (
    <SpearShellLayout>
      <IntakeQueueSurface />
    </SpearShellLayout>
  )
}
