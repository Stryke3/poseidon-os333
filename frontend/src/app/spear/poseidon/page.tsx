import { SpearPoseidon } from "@/components/spear/SpearPoseidon"
import { SpearShellLayout } from "@/components/spear/SpearShellLayout"
import { requireSpearPageAuth } from "@/lib/spear-auth"

export const dynamic = "force-dynamic"

export default async function SpearPoseidonPage() {
  const auth = await requireSpearPageAuth("/spear/poseidon")

  return (
    <SpearShellLayout
      userName={auth.user?.email ?? auth.user?.id}
      userEmail={auth.user?.email}
    >
      <SpearPoseidon />
    </SpearShellLayout>
  )
}
