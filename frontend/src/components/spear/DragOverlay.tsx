"use client"

import type { SpearBoardCase } from "@/lib/spear-board"

export function DragOverlay({
  caseItem,
  x,
  y,
}: {
  caseItem: SpearBoardCase
  x: number
  y: number
}) {
  return (
    <div className="pointer-events-none fixed z-[70] w-[320px] -translate-x-[30%] -translate-y-[45%]" style={{ left: x, top: y }}>
      <div className="rounded-[26px] border border-[#78edf2]/36 bg-[linear-gradient(180deg,rgba(117,196,210,0.28),rgba(245,249,255,0.12))] p-4 text-[#f7f3ea] shadow-[0_0_0_1px_rgba(118,237,241,0.18),0_0_34px_rgba(118,237,241,0.28),0_32px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/12 pb-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-200">
            <span className="h-3 w-3 rounded-full border border-white/30" />
            Drop here to start intake flow
          </div>
          <span className="text-xs text-slate-300">×</span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-300">Case: {caseItem.caseId}</p>
            <h3 className="mt-2 font-serif text-[2rem] leading-none">{caseItem.patientName}</h3>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-[#76edf1]/35 bg-[#76edf1]/12 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#effcfb]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#76edf1]" />
            Moving
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-100">{caseItem.procedure}</p>
        <p className="mt-1 text-sm text-slate-300">{caseItem.payer}</p>
      </div>
    </div>
  )
}
