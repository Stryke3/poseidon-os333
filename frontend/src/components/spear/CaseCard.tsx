"use client"

import type { PointerEvent as ReactPointerEvent } from "react"

import type { SpearBoardCase } from "@/lib/spear-board"

function edgeTone(status: SpearBoardCase["status"]) {
  if (status === "generate") return "before:bg-[#6f8f5b]"
  if (status === "review") return "before:bg-[#d48a63]"
  if (status === "extract") return "before:bg-[#8d82df]"
  return "before:bg-[#cde45d]"
}

export function CaseCard({
  caseItem,
  selected,
  dragging,
  onPointerDown,
  onSelect,
}: {
  caseItem: SpearBoardCase
  selected: boolean
  dragging: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onClick={onSelect}
      className={`relative w-full overflow-hidden rounded-[22px] border bg-[#f8f1e4] p-4 text-left text-[#1b1920] shadow-[0_14px_28px_rgba(27,25,32,0.06)] transition before:absolute before:bottom-0 before:left-0 before:top-0 before:w-[4px] ${edgeTone(
        caseItem.status,
      )} ${
        selected
          ? "border-[#d9eb74] shadow-[0_0_0_1px_rgba(201,224,97,0.25),0_22px_36px_rgba(27,25,32,0.12)]"
          : "border-black/6 hover:border-black/12"
      } ${dragging ? "scale-[0.985] opacity-35" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">{caseItem.caseId}</p>
          <h3 className="mt-2 font-serif text-[1.6rem] leading-none">{caseItem.patientName}</h3>
        </div>
        <span className="rounded-full border border-black/6 bg-black/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-600">
          {caseItem.statusChip}
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-600">
        <p>{caseItem.procedure}</p>
        <p>{caseItem.payer}</p>
      </div>

      {caseItem.status === "intake" ? (
        <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-500">
          <span>{caseItem.pdfCount} PDFs</span>
          <span>Awaiting OCR</span>
        </div>
      ) : null}

      {caseItem.status === "extract" ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-500">
            <span>Extraction progress</span>
            <span>{caseItem.extractionProgress}%</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-black/[0.06]">
            <div className="h-full rounded-full bg-[#8d82df]" style={{ width: `${caseItem.extractionProgress}%` }} />
          </div>
        </div>
      ) : null}

      {caseItem.status === "review" ? (
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Blocker</p>
            <p className="mt-1 text-sm font-medium text-[#1b1920]">{caseItem.blockerType || "Manual review"}</p>
          </div>
          <span className="rounded-full bg-[#f6e6df] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[#ad5735]">
            {caseItem.priority}
          </span>
        </div>
      ) : null}

      {caseItem.status === "generate" ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="rounded-full bg-[#e2edd8] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[#44603b]">
            Ready
          </span>
          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">SWO + Addendum</span>
        </div>
      ) : null}
    </button>
  )
}
