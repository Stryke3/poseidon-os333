"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { href: "/settings", label: "User Access" },
  { href: "/settings/wiki", label: "Training Wiki" },
]

export default function SettingsTabs() {
  const pathname = usePathname()

  return (
    <nav className="mb-6 flex gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
      {TABS.map((tab) => {
        const active =
          tab.href === "/settings"
            ? pathname === "/settings"
            : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.14em] transition ${
              active
                ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
