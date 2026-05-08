import IntakeQueueSurface from "@/components/spear/intake/IntakeQueueSurface"
import { SpearShellLayout } from "@/components/spear/SpearShellLayout"

export const dynamic = "force-dynamic"

export default function SpearIntakePage() {
  return (
    <SpearShellLayout>
      <IntakeQueueSurface />
    </SpearShellLayout>
  )
}
