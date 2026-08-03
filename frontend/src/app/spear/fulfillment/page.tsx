import { SpearFulfillment } from "@/components/spear/SpearFulfillment"
import { SpearShellLayout } from "@/components/spear/SpearShellLayout"
import { requireSpearPageAuth } from "@/lib/spear-auth"

export const dynamic = "force-dynamic"

export default async function SpearFulfillmentPage() {
  const auth = await requireSpearPageAuth("/spear/fulfillment")

  return (
    <SpearShellLayout
      userName={auth.user?.email ?? auth.user?.id}
      userEmail={auth.user?.email}
    >
      <SpearFulfillment />
    </SpearShellLayout>
  )
}
