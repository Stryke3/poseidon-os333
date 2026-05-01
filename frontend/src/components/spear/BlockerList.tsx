import type { SpearBlocker } from "@/lib/spear-board"

function blockerAccent(code: SpearBlocker["code"]) {
  if (code === "code_conflict" || code === "mixed_patient_packet" || code === "dob_conflict") {
    return {
      border: "border-l-[#d47a63]",
      background: "bg-[#f8e8df]",
      icon: "!",
    }
  }
  if (code === "low_confidence_extraction") {
    return {
      border: "border-l-[#d2a347]",
      background: "bg-[#fbf1db]",
      icon: "~",
    }
  }
  return {
    border: "border-l-[#8479d8]",
    background: "bg-[#efebff]",
    icon: "+",
  }
}

export function BlockerList({ blockers }: { blockers: SpearBlocker[] }) {
  if (!blockers.length) {
    return <div className="rounded-[24px] border border-black/6 bg-white px-4 py-4 text-sm text-slate-600">No active blockers.</div>
  }

  return (
    <div className="space-y-3">
      {blockers.map((blocker) => {
        const accent = blockerAccent(blocker.code)
        return (
          <div
            key={blocker.code}
            className={`rounded-[22px] border border-black/6 border-l-4 px-4 py-3 shadow-[0_10px_20px_rgba(16,18,22,0.04)] ${accent.border} ${accent.background}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-black/[0.05] text-xs font-semibold text-[#1b1920]">
                  {accent.icon}
                </span>
                <div>
                  <p className="text-sm font-medium text-[#151519]">{blocker.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{blocker.source || "Rule engine"}</p>
                </div>
              </div>
              <button type="button" className="text-[10px] uppercase tracking-[0.22em] text-slate-500 transition hover:text-slate-900">
                Review
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
