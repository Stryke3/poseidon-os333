"use client";

type KPIs = {
  billedThisMonth: number;
  expectedThisMonth: number;
  collectedThisMonth: number;
  arOutstanding: number;
  avgDaysToPayment: number;
  realizationRate: number;
  cleanClaimRate: number;
};

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
}

function pct(n: number) {
  return `${Math.round(Number(n || 0) * 100)}%`;
}

export default function KPICards({ kpis }: { kpis: KPIs }) {
  const cards = [
    { label: "Billed This Month", value: fmtUSD(kpis.billedThisMonth), sub: `${pct(kpis.cleanClaimRate)} clean-claim rate`, accent: "#2563EB" },
    { label: "Expected This Month", value: fmtUSD(kpis.expectedThisMonth), sub: `${pct(kpis.realizationRate)} realization`, accent: "#D97706" },
    { label: "Collected This Month", value: fmtUSD(kpis.collectedThisMonth), sub: "Posted payments", accent: "#059669" },
    { label: "A/R Outstanding", value: fmtUSD(kpis.arOutstanding), sub: `${kpis.avgDaysToPayment || 0} days avg payment`, accent: "#DC2626" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <section key={card.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 h-1 w-10 rounded-full" style={{ background: card.accent }} />
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{card.label}</p>
          <p className="mt-2 text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">{card.value}</p>
          <p className="mt-2 text-sm text-slate-500">{card.sub}</p>
        </section>
      ))}
    </div>
  );
}
