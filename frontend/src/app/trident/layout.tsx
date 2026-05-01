import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getSafeServerSession } from "@/lib/auth"

export const metadata: Metadata = {
  title: "SPEAR",
  description: "Operational document intelligence board.",
}

export default async function TridentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSafeServerSession()

  if (!session?.user?.accessToken) {
    redirect("/login?callbackUrl=/trident")
  }

  return children
}
