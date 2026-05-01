import { redirect } from "next/navigation"

import { ReferenceListsAdminClient } from "@/components/trident/ReferenceListsAdminClient"
import { getSafeServerSession } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function TridentReferenceAdminPage() {
  const session = await getSafeServerSession()
  if (!session?.user?.accessToken) {
    redirect("/login?callbackUrl=/trident/admin/references")
  }
  if (session.user.role !== "admin") {
    redirect("/trident")
  }

  return <ReferenceListsAdminClient email={session.user.email || ""} />
}
