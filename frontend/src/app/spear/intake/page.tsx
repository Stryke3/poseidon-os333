import IntakeQueueSurface from "@/components/spear/intake/IntakeQueueSurface"
import { SpearShellLayout } from "@/components/spear/SpearShellLayout"
import { requireSpearPageAuth } from "@/lib/spear-auth"

export const dynamic = "force-dynamic"

export default async function SpearIntakePage() {
  const auth = await requireSpearPageAuth("/spear/intake")

  return (
    <SpearShellLayout
      userName={auth.user?.email ?? auth.user?.id}
      userEmail={auth.user?.email}
    >
      <IntakeQueueSurface />
    </SpearShellLayout>
  )
}
