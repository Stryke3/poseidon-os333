import { SpearIntegrationHealth } from "@/components/spear/SpearIntegrationHealth"
import { SpearShellLayout } from "@/components/spear/SpearShellLayout"
import { requireSpearPageAuth } from "@/lib/spear-auth"
export const dynamic = "force-dynamic"
export default async function Page() { const auth = await requireSpearPageAuth("/spear/integrations"); return <SpearShellLayout userName={auth.user?.email} userEmail={auth.user?.email}><SpearIntegrationHealth /></SpearShellLayout> }
