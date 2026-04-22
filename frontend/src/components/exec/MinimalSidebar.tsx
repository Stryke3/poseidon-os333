"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS: { href: string; label: string }[] = [
  { href: "/exec", label: "Patient run" },
  { href: "/login", label: "Sign in" },
]

export default function MinimalSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-slate-950/90 px-3 py-4 text-sm text-slate-200">
      <div className="mb-4 px-2 font-semibold uppercase tracking-wide text-emerald-400/90">Poseidon</div>
      <nav className="flex flex-col gap-1">
        {LINKS.map(({ href, label }) => {
          const active = pathname === href || (href !== "/exec" && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-lg px-3 py-2 transition hover:bg-white/5 ${
                active ? "bg-emerald-500/15 text-emerald-200" : "text-slate-400"
              }`}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
