import { SpearCaseWorkspace } from "@/components/spear/SpearCaseWorkspace"
import { SpearShellLayout } from "@/components/spear/SpearShellLayout"
import { requireSpearPageAuth } from "@/lib/spear-auth"

export const dynamic = "force-dynamic"

export default async function SpearCaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const auth = await requireSpearPageAuth(`/spear/cases/${caseId}`)

  return (
    <SpearShellLayout
      userName={auth.user?.email ?? auth.user?.id}
      userEmail={auth.user?.email}
    >
      <SpearCaseWorkspace caseId={caseId} />
    </SpearShellLayout>
  )
}
