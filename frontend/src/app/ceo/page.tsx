import DashboardShell from "@/components/dashboard/DashboardShell"
import { getLiveDashboardData } from "@/lib/dashboard-data"

export default async function CeoPage() {
  const data = await getLiveDashboardData()

  return <DashboardShell {...data} variant="ceo" />
}
