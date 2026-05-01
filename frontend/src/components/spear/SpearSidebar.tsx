"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { signOut } from "next-auth/react"

function cn(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ")
}

const navItems = [
  { href: "/trident", label: "Cases", icon: "◎" },
  { href: "/trident/settings?panel=rules", label: "Rules", icon: "▣" },
  { href: "/trident/generated", label: "Activity", icon: "∿" },
  { href: "/trident/settings?panel=settings", label: "Settings", icon: "◫" },
]

export function SpearSidebar({
  userEmail,
  userRole,
}: {
  userEmail: string
  userRole: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const panel = searchParams.get("panel")
  const initials = userEmail.slice(0, 2).toUpperCase()

  return (
    <aside className="flex h-screen w-[104px] flex-col justify-between border-r border-white/6 bg-[linear-gradient(180deg,rgba(18,20,28,0.98),rgba(15,16,23,0.98))] px-2 py-5 text-[#f4f1e8]">
      <div>
        <div className="mb-10 px-2">
          <div className="grid h-14 w-14 place-items-center rounded-full border border-[#d9eb74]/32 bg-[#d9eb74]/6 text-[#d9eb74] shadow-[0_16px_30px_rgba(0,0,0,0.16)]">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="12" cy="12" r="8.2" />
              <circle cx="12" cy="12" r="2.5" />
              <path d="M12 3.8v5.2M6.3 8.1 9.6 10M17.7 8.1 14.4 10M12 20.2V15M6.3 15.9l3.3-1.9M17.7 15.9l-3.3-1.9" strokeLinecap="round" />
            </svg>
          </div>
          <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.34em] text-[#d9eb74]/78">SPEAR</p>
        </div>

        <nav className="space-y-3">
          {navItems.map((item) => {
            const active =
              item.href === "/trident"
                ? pathname === "/trident" || pathname.startsWith("/trident/cases")
                : item.label === "Rules"
                  ? pathname === "/trident/settings" && panel !== "settings"
                  : item.label === "Settings"
                    ? pathname === "/trident/settings" && panel === "settings"
                    : pathname === item.href

            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className={cn(
                  "relative flex min-h-[92px] flex-col items-center justify-center rounded-[22px] border px-2 text-center transition",
                  active
                    ? "border-[#d9eb74]/20 bg-white/[0.02] text-[#f7f4e8]"
                    : "border-transparent text-slate-500 hover:border-white/8 hover:bg-white/[0.03] hover:text-slate-200",
                )}
              >
                {active ? <span className="absolute inset-y-4 left-[-9px] w-[2px] rounded-full bg-[#d9eb74]" /> : null}
                <span className="text-xl leading-none">{item.icon}</span>
                <span className="mt-3 text-[11px] font-medium uppercase tracking-[0.12em]">{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="space-y-3 px-1">
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3 text-center">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Level 12</p>
          <p className="mt-1 text-xs text-slate-100">Case Master</p>
        </div>
        <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-3 py-3">
          <div className="flex items-center justify-center">
            <div className="grid h-10 w-10 place-items-center rounded-full border border-[#d9eb74]/22 bg-white/[0.04] text-[11px] font-semibold text-[#f4f1e8]">
              {initials}
            </div>
          </div>
          <p className="mt-2 truncate text-center text-[10px] uppercase tracking-[0.16em] text-slate-500">{userRole}</p>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full rounded-full border border-white/8 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-slate-400 transition hover:border-white/16 hover:text-white"
        >
          Exit
        </button>
      </div>
    </aside>
  )
}
