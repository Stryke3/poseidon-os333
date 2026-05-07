import { MasterTracker } from "@/components/dashboard/MasterTracker"
import { getMasterTrackerData } from "@/lib/master-tracker"

export const dynamic = "force-dynamic"

export default async function MasterTrackerPage() {
  const trackerData = await getMasterTrackerData()

  return <MasterTracker initialData={trackerData} />
}
