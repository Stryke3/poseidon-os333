import type { Metadata } from "next"

import { getSafeServerSession } from "@/lib/auth"

import "./globals.css"
import Providers from "./providers"

export const metadata: Metadata = {
  title: "SUPER TRIDENT — OCR document intelligence engine",
  description: "SUPER TRIDENT ingests patient record PDFs, extracts structured facts, and generates SWO plus payer addendums.",
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
