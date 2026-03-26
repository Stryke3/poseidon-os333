import NeuralOsDashboard from "@/components/dashboard/NeuralOsDashboard"
import { getLiveDashboardData } from "@/lib/dashboard-data"

export default async function MatiaPage() {
  const data = await getLiveDashboardData()

  return (
    <NeuralOsDashboard
      initialAccounts={data.initialAccounts}
      initialCommunications={data.initialCommunications}
      initialIntegrations={data.initialIntegrations}
      initialKanban={data.initialKanban}
      initialKPIs={data.initialKPIs}
      initialSystemState={data.initialSystemState}
      initialBusinessLine="matia"
    />
  )
}
