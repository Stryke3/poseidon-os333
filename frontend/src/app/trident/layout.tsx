import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "SUPER TRIDENT — OCR document intelligence engine",
  description: "Upload patient records, review extracted facts, and generate SWO plus payer addendums.",
}

const navItems = [
  { href: "/trident/cases", label: "Intake Queue" },
  { href: "/trident/generated", label: "Generated Docs" },
  { href: "/trident/settings", label: "Settings / Rules" },
]

export default function TridentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f3f1ea] text-slate-950">
      <header className="border-b border-slate-300 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-700">SUPER TRIDENT</p>
            <h1 className="text-xl font-semibold tracking-tight">TRIDENT OCR ENGINE</h1>
            <p className="text-sm text-slate-600">
              Upload PDFs, extract facts, review conflicts, and generate SWO plus payer addendums.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  )
}
