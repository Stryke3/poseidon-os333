import type { Metadata } from "next"

import { getSafeServerSession } from "@/lib/auth"

import "./globals.css"
import Providers from "./providers"

export const metadata: Metadata = {
  title: "StrykeFox Medical - Healthcare Platform & Clinical Solutions",
  description: "StrykeFox Medical delivers comprehensive healthcare platforms, clinical solutions, and operational excellence for modern healthcare delivery.",
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
