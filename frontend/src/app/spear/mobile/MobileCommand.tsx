"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BriefcaseBusiness, CircleDollarSign, Clock3, Home, Search } from "lucide-react";
import styles from "./mobile.module.css";

type Data = {
  kpis: Record<string, number>;
  buckets: Array<{ key: string; expectedCash: number; claims: number; majorPayers: string[]; confidence: string }>;
  actionCounts: Record<string, number>;
  actions: Array<{ id: string; category: string; caseId: string; patient: string; payer: string; revenueAtRisk: number | null; blocker: string; nextAction: string; age: number }>;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const bucketName: Record<string, string> = { TODAY: "Today", NEXT_7_DAYS: "Next 7 days", DAYS_8_14: "Days 8–14", DAYS_15_30: "Days 15–30", DAYS_31_60: "Days 31–60", DAYS_61_PLUS: "61+ days", UNSCHEDULED: "Unscheduled" };
const nav = [{ label: "Home", icon: Home }, { label: "Search", icon: Search }, { label: "Claims", icon: BriefcaseBusiness }, { label: "Tasks", icon: Clock3 }, { label: "Revenue", icon: CircleDollarSign }];

export default function MobileCommand() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/spear/mobile/command", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Command data unavailable");
      setData(body);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Command data unavailable"));
  }, []);

  return <main className={styles.app}>
    <header className={styles.header}><div><span className={styles.eyebrow}>SPEAR</span><h1>Command</h1></div><div className={styles.actionPill}>{data ? data.actions.length : "—"}<span>actions</span></div></header>
    {error ? <div className={styles.error}>{error}</div> : null}
    {!data ? <div className={styles.loading}>Loading live SPEAR revenue…</div> : <>
      <section className={styles.hero}><span>Expected revenue</span><strong>{money.format(data.kpis.expectedRevenue || 0)}</strong><small>Forecast, not guaranteed cash</small></section>
      <section className={styles.kpis}><article><span>Revenue submitted</span><strong>{money.format(data.kpis.revenueSubmitted || 0)}</strong></article><article><span>Collected</span><strong>{money.format(data.kpis.collected || 0)}</strong></article><article><span>A/R outstanding</span><strong>{money.format(data.kpis.arOutstanding || 0)}</strong></article></section>
      <section><div className={styles.sectionHead}><h2>Expected cash</h2><span>Claim-level forecast</span></div><div className={styles.list}>{data.buckets.map((bucket) => <article className={styles.cashRow} key={bucket.key}><div><strong>{bucketName[bucket.key]}</strong><small>{bucket.claims} claims · {bucket.confidence.toLowerCase()} confidence{bucket.majorPayers.length ? ` · ${bucket.majorPayers.join(", ")}` : ""}</small></div><b>{money.format(bucket.expectedCash)}</b></article>)}</div></section>
      <section><div className={styles.sectionHead}><h2>Action queue</h2><span>Deadline · risk · age</span></div><div className={styles.counts}>{Object.entries(data.actionCounts).map(([key, count]) => <span key={key}><b>{count}</b>{key.replaceAll("_", " ")}</span>)}</div><div className={styles.list}>{data.actions.slice(0, 8).map((action) => <Link className={styles.actionRow} href={`/spear/mobile/cases/${encodeURIComponent(action.caseId)}`} key={action.id}><div className={styles.rowTop}><span>{action.category.replaceAll("_", " ")}</span><b>{action.revenueAtRisk === null ? "Not forecast" : money.format(action.revenueAtRisk)}</b></div><strong>{action.payer || "Payer unavailable"} · {action.patient || "Patient unavailable"}</strong><small>{action.blocker} · {action.age} days</small><em>{action.nextAction} →</em></Link>)}</div></section>
    </>}
    <nav className={styles.nav}>{nav.map(({ label, icon: Icon }, index) => <Link className={index === 0 ? styles.active : ""} href={label === "Search" || label === "Claims" ? "/spear/mobile/search" : "/spear/mobile"} key={label}><Icon size={20}/><span>{label}</span></Link>)}</nav>
  </main>;
}
