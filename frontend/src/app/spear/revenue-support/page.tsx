import { SpearRevenueSupport } from "@/components/spear/SpearRevenueSupport"
import { SpearShellLayout } from "@/components/spear/SpearShellLayout"
import { requireSpearPageAuth } from "@/lib/spear-auth"

export const dynamic = "force-dynamic"

export default async function SpearRevenueSupportPage() {
  const auth = await requireSpearPageAuth("/spear/revenue-support")

  return (
    <SpearShellLayout
      userName={auth.user?.email ?? auth.user?.id}
      userEmail={auth.user?.email}
    >
      <SpearRevenueSupport />
    </SpearShellLayout>
  )
}
