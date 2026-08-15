"use client";

const STAGES = [
  { key: "intake", label: "Intake", color: "bg-slate-500" },
  { key: "docsComplete", label: "Docs Complete", color: "bg-blue-500" },
  { key: "submitted", label: "Submitted", color: "bg-indigo-500" },
  { key: "acknowledged", label: "Acknowledged", color: "bg-amber-500" },
  { key: "inPayment", label: "In Payment", color: "bg-cyan-600" },
  { key: "paid", label: "Paid", color: "bg-emerald-600" },
  { key: "denied", label: "Denied", color: "bg-rose-600" },
] as const;

export default function PipelineFlow({ pipeline }: { pipeline: Record<string, number> }) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-[760px] items-start justify-between gap-2">
        {STAGES.map((stage, idx) => (
          <div key={stage.key} className="flex flex-1 items-center">
            <div className="flex min-w-[88px] flex-1 flex-col items-center">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${stage.color} text-sm font-bold text-white shadow-sm`}>
                {pipeline?.[stage.key] ?? 0}
              </div>
              <span className="mt-2 text-center text-xs font-semibold text-slate-600">{stage.label}</span>
            </div>
            {idx < STAGES.length - 1 ? <div className="h-px w-8 shrink-0 bg-slate-300" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
