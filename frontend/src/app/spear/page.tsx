import { SpearCommand } from "@/components/spear/SpearCommand"
import { SpearShellLayout } from "@/components/spear/SpearShellLayout"
import { getSpearCommandData } from "@/lib/spear-command"

export const dynamic = "force-dynamic"

export default async function SpearCommandPage() {
  const commandData = await getSpearCommandData()

  return (
    <SpearShellLayout>
      <SpearCommand initialData={commandData} />
    </SpearShellLayout>
  )
}
