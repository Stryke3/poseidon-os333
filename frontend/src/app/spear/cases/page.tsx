import { SpearCases } from "@/components/spear/SpearCases"
import { SpearShellLayout } from "@/components/spear/SpearShellLayout"
import { requireSpearPageAuth } from "@/lib/spear-auth"

export const dynamic = "force-dynamic"

export default async function SpearCasesPage() {
  const auth = await requireSpearPageAuth("/spear/cases")

  return (
    <SpearShellLayout
      userName={auth.user?.email ?? auth.user?.id}
      userEmail={auth.user?.email}
    >
      <SpearCases />
    </SpearShellLayout>
  )
}
