import DashboardShell from "@/components/dashboard/DashboardShell"
import { getLiveDashboardData } from "@/lib/dashboard-data"

export default async function ExecutivePage() {
  const data = await getLiveDashboardData()

  return <DashboardShell {...data} variant="executive" />
}
