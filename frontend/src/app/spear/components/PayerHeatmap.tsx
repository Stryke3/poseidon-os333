"use client";

type PayerAgingCell = {
  payer: string;
  bucket: string;
  amount: number;
  count: number;
};

const BUCKETS = ["0-30", "31-60", "61-90", "90+"];

function heatColor(amount: number, max: number) {
  if (!amount) return "bg-slate-50 text-slate-400";
  const intensity = Math.min(amount / Math.max(max, 1), 1);
  if (intensity > 0.75) return "bg-rose-600 text-white";
  if (intensity > 0.5) return "bg-rose-400 text-white";
  if (intensity > 0.25) return "bg-rose-100 text-rose-900";
  return "bg-blue-50 text-blue-800";
}

export default function PayerHeatmap({ data }: { data: PayerAgingCell[] }) {
  const payers = Array.from(new Set((data || []).map((row) => row.payer))).sort();
  const maxAmount = Math.max(...(data || []).map((row) => row.amount), 1);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Payer Aging Heatmap</h3>
      {!payers.length ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">No aging data yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[430px] text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-2 py-2 text-left text-xs font-semibold text-slate-500">Payer</th>
                {BUCKETS.map((bucket) => <th key={bucket} className="px-2 py-2 text-right text-xs font-semibold text-slate-500">{bucket}</th>)}
              </tr>
            </thead>
            <tbody>
              {payers.map((payer) => (
                <tr key={payer} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-2 font-semibold text-slate-700">{payer}</td>
                  {BUCKETS.map((bucket) => {
                    const cell = data.find((row) => row.payer === payer && row.bucket === bucket);
                    const amount = cell?.amount ?? 0;
                    return (
                      <td key={bucket} className={`rounded px-2 py-2 text-right text-xs font-semibold ${heatColor(amount, maxAmount)}`} title={`${cell?.count ?? 0} claims`}>
                        {amount ? `$${(amount / 1000).toFixed(1)}k` : "-"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
