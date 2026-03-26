import Link from "next/link"

import RevenueCommandSurface from "@/components/executive/RevenueCommandSurface"

export default function RevenueCommandPage() {
  return (
    <div className="relative min-h-screen">
      <nav className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex items-center gap-3 px-4 pt-3 sm:px-6">
        <Link
          href="/"
          className="pointer-events-auto rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400 backdrop-blur-sm transition hover:border-accent-blue/30 hover:text-white"
        >
          Live OS
        </Link>
        <span className="text-[10px] text-slate-600">/</span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Revenue</span>
      </nav>
      <RevenueCommandSurface />
    </div>
  )
}
