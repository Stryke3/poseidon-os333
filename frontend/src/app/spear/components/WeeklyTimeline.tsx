"use client";

type Deadline = {
  caseId: string;
  deadline: string;
  type: string;
  amount: number;
  hoursRemaining: number;
};

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n || 0));
}

export default function WeeklyTimeline({ deadlines }: { deadlines: Deadline[] }) {
  const urgent = (deadlines || []).sort((a, b) => a.hoursRemaining - b.hoursRemaining);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Weekly Timeline</h3>
      <div className="mb-5 grid grid-cols-7 gap-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="rounded border border-slate-200 bg-slate-50 px-1 py-3 text-center text-[11px] font-semibold text-slate-500">{day}</div>
        ))}
      </div>

      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Next 72 Hours</h4>
      {!urgent.length ? (
        <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No urgent deadlines in the next 72 hours.</p>
      ) : (
        <div className="space-y-2">
          {urgent.map((item) => (
            <div key={`${item.caseId}-${item.deadline}`} className={`rounded-lg border p-3 ${item.hoursRemaining < 24 ? "border-rose-300 bg-rose-50" : "border-amber-300 bg-amber-50"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold capitalize text-slate-700">{item.type.replace(/_/g, " ")}</p>
                  <p className="break-all text-xs text-slate-500">Case {item.caseId}</p>
                </div>
                <p className="shrink-0 text-xs font-bold text-rose-700">{item.hoursRemaining < 24 ? "< 24h" : "< 72h"}</p>
              </div>
              <p className="mt-1 text-xs text-slate-700">{fmtUSD(item.amount)} at risk</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
