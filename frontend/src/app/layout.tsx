import type { Metadata } from "next"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"

import "./globals.css"
import Providers from "./providers"

export const metadata: Metadata = {
  title: "Poseidon with Trident Technology - Clinical. Revenue. Control.",
  description: "Poseidon with Trident Technology - Clinical. Revenue. Control.",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  return (
    <html lang="en">
      <body>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  )
}
