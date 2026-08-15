"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type DenialItem = {
  reason: string;
  count: number;
  amount: number;
  pct: number;
};

type AppealStatus = {
  drafted: number;
  submitted: number;
  pending: number;
  wonAmount: number;
  lostAmount: number;
  winRate: number;
};

const COLORS = ["#DC2626", "#EA580C", "#D97706", "#2563EB", "#64748B"];

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n || 0));
}

export default function DenialAppealPanel({ denials, appeals }: { denials: DenialItem[]; appeals: AppealStatus }) {
  const appealTotal = Math.max((appeals?.drafted || 0) + (appeals?.submitted || 0) + (appeals?.pending || 0), 1);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Denial & Appeal</h3>

      {denials?.length ? (
        <div className="mb-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={denials} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="count" nameKey="reason">
                {denials.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip
                formatter={(_value, _name, entry) => {
                  const payload = entry?.payload as DenialItem | undefined;
                  return [`${payload?.pct ?? 0}% - ${fmtUSD(payload?.amount ?? 0)}`, payload?.reason ?? "Denial"];
                }}
                contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">No denial data yet</div>
      )}

      <div className="mb-5 flex flex-wrap gap-2 text-xs text-slate-600">
        {(denials || []).map((denial, i) => (
          <span key={denial.reason} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            {denial.reason} ({denial.pct}%)
          </span>
        ))}
      </div>

      <div className="space-y-3">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Appeal Status</h4>
        {[
          { label: "Drafted", count: appeals?.drafted || 0 },
          { label: "Submitted", count: appeals?.submitted || 0 },
          { label: "Pending", count: appeals?.pending || 0 },
        ].map((bar) => (
          <div key={bar.label}>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{bar.label}</span><span>{bar.count}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-blue-600" style={{ width: `${(bar.count / appealTotal) * 100}%` }} />
            </div>
          </div>
        ))}

        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Won</p>
            <p className="font-bold text-emerald-700">{fmtUSD(appeals?.wonAmount || 0)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">Win Rate</p>
            <p className="font-bold text-slate-950">{Math.round((appeals?.winRate || 0) * 100)}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Lost</p>
            <p className="font-bold text-rose-700">{fmtUSD(appeals?.lostAmount || 0)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
