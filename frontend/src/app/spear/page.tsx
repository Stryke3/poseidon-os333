"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SpearShellLayout from "@/components/spear/SpearShellLayout";
import DenialAppealPanel from "./components/DenialAppealPanel";
import KPICards from "./components/KPICards";
import PayerHeatmap from "./components/PayerHeatmap";
import PipelineFlow from "./components/PipelineFlow";
import RevenueChart from "./components/RevenueChart";
import WeeklyTimeline from "./components/WeeklyTimeline";

type DashboardSnapshot = {
  snapshotAt: string;
  kpis: {
    billedThisMonth: number;
    expectedThisMonth: number;
    collectedThisMonth: number;
    arOutstanding: number;
    avgDaysToPayment: number;
    realizationRate: number;
    cleanClaimRate: number;
  };
  pipeline: Record<string, number>;
  weeklyRevenue: Array<{ week: string; billed: number; expected: number; collected: number; daysToPayment: number }>;
  payerAging: Array<{ payer: string; bucket: string; amount: number; count: number }>;
  denialReasons: Array<{ reason: string; count: number; amount: number; pct: number }>;
  appealStatus: { drafted: number; submitted: number; pending: number; wonAmount: number; lostAmount: number; winRate: number };
  upcomingDeadlines: Array<{ caseId: string; deadline: string; type: string; amount: number; hoursRemaining: number }>;
};

export default function SpearCeoDashboard() {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    const response = await fetch("/api/spear/dashboard/ceo", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
    setData(payload as DashboardSnapshot);
    setError("");
  }, []);

  useEffect(() => {
    loadDashboard().catch((err) => setError(err instanceof Error ? err.message : "Dashboard unavailable"));

    const source = new EventSource("/api/spear/dashboard/ceo/stream");
    source.addEventListener("message", (event) => {
      if (!event.data || event.data === "{}") return;
      try {
        const update = JSON.parse(event.data);
        setData((current) => ({ ...(current || update), ...update }));
      } catch {
        loadDashboard().catch(() => undefined);
      }
    });
    source.addEventListener("heartbeat", () => {
      loadDashboard().catch(() => undefined);
    });
    source.onerror = () => {
      loadDashboard().catch(() => undefined);
    };

    return () => source.close();
  }, [loadDashboard]);

  return (
    <SpearShellLayout>
      <div className="min-h-screen text-slate-950">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">CEO Reporting</p>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-slate-950">SPEAR Revenue Command</h1>
            <p className="mt-2 text-sm text-slate-500">
              {data?.snapshotAt ? `Last updated ${new Date(data.snapshotAt).toLocaleString()}` : "Loading live production snapshot"}
            </p>
          </div>
          <Link href="/spear/ops" className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-800">
            Operations View
          </Link>
        </header>

        {error ? (
          <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Dashboard connection warning: {error}
          </div>
        ) : null}

        {!data ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">Loading SPEAR CEO dashboard...</div>
        ) : (
          <div className="space-y-6">
            <KPICards kpis={data.kpis} />

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Claims Pipeline</h2>
                  <p className="mt-1 text-sm text-slate-500">From intake through payment, denial, and appeal exposure.</p>
                </div>
              </div>
              <PipelineFlow pipeline={data.pipeline} />
              <div className="mt-6 h-[320px] min-h-[260px]">
                <RevenueChart weekly={data.weeklyRevenue} />
              </div>
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <PayerHeatmap data={data.payerAging} />
              <DenialAppealPanel denials={data.denialReasons} appeals={data.appealStatus} />
              <WeeklyTimeline deadlines={data.upcomingDeadlines} />
            </section>
          </div>
        )}
      </div>
    </SpearShellLayout>
  );
}
