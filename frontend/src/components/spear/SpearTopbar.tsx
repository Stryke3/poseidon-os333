"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

export function SpearTopbar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get("q") || "")

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    router.push(trimmed ? `/trident?q=${encodeURIComponent(trimmed)}` : "/trident")
  }

  return (
    <header className="border-b border-white/6 bg-[linear-gradient(180deg,rgba(29,32,38,0.98),rgba(24,26,33,0.98))] px-5 py-5 lg:px-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-6">
          <div>
            <p className="font-serif text-[4rem] leading-none tracking-[-0.08em] text-[#f4eee2] sm:text-[5.5rem]">SPEAR</p>
          </div>
          <div className="hidden h-20 w-px bg-[#d9eb74]/45 xl:block" />
          <div className="max-w-[210px]">
            <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-slate-300">Operational</p>
            <p className="mt-2 text-sm font-medium uppercase tracking-[0.32em] text-slate-300">Intelligence</p>
            <p className="mt-1 text-sm font-medium uppercase tracking-[0.32em] text-slate-300">Engine</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:items-end">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form
              onSubmit={onSubmit}
              className="flex items-center gap-3 rounded-full border border-[#67d6ec]/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))] px-5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(103,214,236,0.08)]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search..."
                className="w-60 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
            </form>
            <div className="rounded-2xl border border-[#d9eb74]/30 bg-[#d9eb74] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#17141a] shadow-[0_10px_30px_rgba(217,235,116,0.22)]">
              Generate
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
            <span className="h-2 w-2 rounded-full border border-[#d9eb74]/30 bg-[#d9eb74]/12" />
            Active interaction: enqueuing case
          </div>
        </div>
      </div>
    </header>
  )
}
