"use client"

import Link from "next/link"

import { BlockerList } from "@/components/spear/BlockerList"
import { NextActionCard } from "@/components/spear/NextActionCard"
import type { SpearBoardCase } from "@/lib/spear-board"

function statusTone(status: SpearBoardCase["status"]) {
  if (status === "generate") return "bg-[#dbe7d0] text-[#425c3a]"
  if (status === "review") return "bg-[#f1dfd7] text-[#9a5534]"
  if (status === "extract") return "bg-[#ebe7ff] text-[#6154c2]"
  return "bg-[#ece8df] text-[#546170]"
}

export function FocusCasePanel({
  caseItem,
  onGenerate,
}: {
  caseItem: SpearBoardCase | null
  onGenerate: () => void
}) {
  if (!caseItem) {
    return (
      <section className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(72,76,86,0.72)_0%,rgba(25,21,31,0.96)_16%,rgba(20,17,26,0.98)_100%)] p-6 text-slate-400 shadow-[0_28px_64px_rgba(0,0,0,0.24)]">
        Select a case to inspect blockers and next action.
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(72,76,86,0.78)_0%,rgba(25,21,31,0.96)_15%,rgba(20,17,26,0.98)_100%)] text-slate-100 shadow-[0_28px_64px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.04))] px-5 py-4">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-300">
          <span className="h-3 w-3 rounded-full border border-white/30" />
          Focus case
        </div>
        <span className="text-sm text-slate-400">×</span>
      </div>

      <div className="bg-[#f4eddf] px-5 py-5 text-[#14131a]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-[3.2rem] leading-none tracking-[-0.05em]">{caseItem.patientName}</h2>
            <p className="mt-2 text-sm uppercase tracking-[0.12em] text-slate-600">
              {caseItem.caseId} • {caseItem.procedure}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${statusTone(caseItem.status)}`}>
            {caseItem.statusChip}
          </span>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        <div className="grid gap-3 rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-3">
            <span>Case ID</span>
            <span className="text-right text-slate-100">{caseItem.caseId}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Payer</span>
            <span className="text-right text-slate-100">{caseItem.payer}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Provider</span>
            <span className="text-right text-slate-100">{caseItem.provider || "Missing"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>DOB</span>
            <span className="text-right text-slate-100">{caseItem.dob || "Missing"}</span>
          </div>
        </div>

        <div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Blockers</p>
          <BlockerList blockers={caseItem.blockers} />
        </div>

        <NextActionCard action={caseItem.nextAction} canGenerate={caseItem.readyToGenerate} onGenerate={onGenerate} />

        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/trident/cases/${caseItem.id}`}
            className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-400 transition hover:text-white"
          >
            Open review
            <span aria-hidden="true">↗</span>
          </Link>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Controlled packet</div>
        </div>
      </div>
    </section>
  )
}
