"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type WeeklyPoint = {
  week: string;
  billed: number;
  expected: number;
  collected: number;
  daysToPayment: number;
};

function fmtUSD(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function RevenueChart({ weekly }: { weekly: WeeklyPoint[] }) {
  if (!weekly?.length) {
    return <div className="flex h-full min-h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">No revenue data yet</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={weekly} margin={{ top: 10, right: 22, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
        <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#64748B" }} />
        <YAxis yAxisId="left" tick={{ fontSize: 12, fill: "#64748B" }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "#64748B" }} tickFormatter={(v: number) => `${v}d`} />
        <Tooltip
          formatter={(value: number, name: string) => name === "Days to Payment" ? [`${value} days`, name] : [fmtUSD(value), name]}
          contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="billed" fill="#2563EB" radius={[4, 4, 0, 0]} name="Billed" />
        <Bar yAxisId="left" dataKey="expected" fill="#D97706" radius={[4, 4, 0, 0]} name="Expected" />
        <Bar yAxisId="left" dataKey="collected" fill="#059669" radius={[4, 4, 0, 0]} name="Collected" />
        <Line yAxisId="right" type="monotone" dataKey="daysToPayment" stroke="#DC2626" strokeWidth={2} dot={false} name="Days to Payment" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
