import type { Metadata } from "next"

import { getSafeServerSession } from "@/lib/auth"

import "./globals.css"
import Providers from "./providers"

export const metadata: Metadata = {
  title: "SPEAR",
  description: "Secure internal access.",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSafeServerSession()

  return (
    <html lang="en">
      <body>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  )
}
