import { SpearTrident } from "@/components/spear/SpearTrident"
import { SpearShellLayout } from "@/components/spear/SpearShellLayout"
import { requireSpearPageAuth } from "@/lib/spear-auth"

export const dynamic = "force-dynamic"

export default async function SpearTridentPage() {
  const auth = await requireSpearPageAuth("/spear/trident")

  return (
    <SpearShellLayout
      userName={auth.user?.email ?? auth.user?.id}
      userEmail={auth.user?.email}
    >
      <SpearTrident />
    </SpearShellLayout>
  )
}
