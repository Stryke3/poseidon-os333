import type { ReactNode } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getSafeServerSession } from "@/lib/auth"

/**
 * Admin-only shell: integrations and other `/admin/*` routes.
 * Provides consistent PageShell chrome and back-navigation.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSafeServerSession()
  if (!session?.user?.accessToken) {
    redirect("/login")
  }
  if (session.user.role !== "admin") {
    redirect("/")
  }

  return (
    <main className="min-h-screen text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 pb-10 pt-4 sm:px-6 sm:pb-12 sm:pt-6 lg:px-8 xl:px-10">
        <nav className="mb-6 flex items-center gap-4">
          <Link
            href="/"
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400 transition hover:border-accent-blue/30 hover:text-white"
          >
            Live OS
          </Link>
          <span className="text-[10px] text-slate-600">/</span>
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Admin</span>
        </nav>
        {children}
      </div>
    </main>
  )
}
