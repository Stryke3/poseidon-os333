"use client"

import type { WorkflowStage } from "@/lib/spear-board"

function cn(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ")
}

export function HoldDropTarget({
  stage,
  label,
  active,
  validTarget,
  invalidTarget,
  holdProgress,
  holdValid,
  caseCount,
  children,
}: {
  stage: WorkflowStage
  label: string
  active: boolean
  validTarget: boolean
  invalidTarget: boolean
  holdProgress: number
  holdValid: boolean
  caseCount: number
  children: React.ReactNode
}) {
  return (
    <section
      data-drop-stage={stage}
      className={cn(
        "relative rounded-[28px] border bg-[linear-gradient(180deg,#27242d_0%,#211e27_100%)] p-4 transition duration-200",
        active ? "border-[#5ce8ed]/60 shadow-[0_0_0_1px_rgba(92,232,237,0.22),0_0_28px_rgba(92,232,237,0.28)]" : "border-white/8",
        validTarget && "bg-[linear-gradient(180deg,#2c3131_0%,#21242a_100%)]",
        invalidTarget && "border-[#d47a63]/50 bg-[linear-gradient(180deg,#332423_0%,#271e22_100%)]",
        holdValid && "border-[#d8eb75]/72 shadow-[0_0_0_1px_rgba(217,235,116,0.34),0_0_32px_rgba(217,235,116,0.28)]",
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
            <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
              {caseCount}
            </span>
          </div>
          <p className="mt-3 text-[2rem] font-serif leading-none text-[#f4eee2]">{label}</p>
          {active && validTarget ? <p className="mt-2 text-sm text-[#d9ebe8]">{holdValid ? "Release to confirm" : "Hold to move case"}</p> : null}
          {active && invalidTarget ? <p className="mt-2 text-sm text-[#e59b84]">Case cannot move to this stage yet</p> : null}
        </div>
        {active ? (
          <div className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/90">
            <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90">
              <circle cx="18" cy="18" r="14" stroke="rgba(0,0,0,0.08)" strokeWidth="2.5" fill="none" />
              <circle
                cx="18"
                cy="18"
                r="14"
                stroke={invalidTarget ? "#d47a63" : holdValid ? "#d9eb74" : "#5ce8ed"}
                strokeWidth="2.5"
                fill="none"
                strokeDasharray={`${Math.max(holdProgress, invalidTarget ? 0.18 : 0) * 88} 88`}
                strokeLinecap="round"
              />
            </svg>
          </div>
        ) : null}
      </div>
      {children}
    </section>
  )
}
