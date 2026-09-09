"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import styles from "../mobile.module.css";

type TrackerStep = { key: string; label: string; status: "complete" | "pending" | "blocked"; detail: string };
type RevenueItem = {
  caseId: string; claimId: string | null; patient: string; provider: string; payer: string; product: string; claimStatus: string; nextAction: string;
  tracker: TrackerStep[];
  facts: { orderId: string; provider: string; payer: string; product: string; dos: string; rep: string };
};

export default function MobileSearch() {
  const [items, setItems] = useState<RevenueItem[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<RevenueItem | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/spear/mobile/command", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Patient search unavailable");
      setItems(body.items || []);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Patient search unavailable"));
  }, []);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return items.filter((item) => [item.patient, item.claimId, item.caseId, item.provider, item.payer, item.product, item.claimStatus]
      .some((value) => String(value || "").toLowerCase().includes(needle))).slice(0, 30);
  }, [items, query]);

  if (selected) return <main className={styles.app}>
    <button type="button" className={styles.backButton} onClick={() => setSelected(null)}><ArrowLeft size={17}/> Back to patient search</button>
    <header className={styles.claimHeader}><span className={styles.eyebrow}>PATIENT CLAIM</span><h1>{selected.patient}</h1><p>{selected.claimId ? `Claim ${selected.claimId}` : `Order ${selected.facts.orderId}`} · {selected.payer || "Payer pending"}</p></header>
    <section className={styles.claimFacts}>
      <div><span>Provider</span><strong>{selected.facts.provider || "Pending"}</strong></div><div><span>Product</span><strong>{selected.facts.product || "Pending"}</strong></div><div><span>DOS</span><strong>{selected.facts.dos}</strong></div><div><span>Rep</span><strong>{selected.facts.rep}</strong></div>
    </section>
    <section className={styles.tracker} aria-label="Claim progress">{selected.tracker.map((item, index) => <article className={`${styles.trackerStep} ${styles[item.status]}`} key={item.key}>
      <div className={styles.trackerRail}><span>{index + 1}</span>{index < selected.tracker.length - 1 ? <i/> : null}</div>
      <div className={styles.trackerCard}><div><h2>{item.label}</h2><b>{item.status === "complete" ? "Complete" : item.status === "blocked" ? "Needs attention" : "Pending"}</b></div><p>{item.detail}</p></div>
    </article>)}</section>
  </main>;

  return <main className={styles.app}>
    <header className={styles.header}><div><span className={styles.eyebrow}>SPEAR MOBILE</span><h1>Find a Patient</h1></div></header>
    <section className={styles.searchPanel}>
      <label htmlFor="patient-search">Patient name</label>
      <div className={styles.searchBox}><Search size={18}/><input id="patient-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing a patient name…" autoComplete="off"/></div>
      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.searchResults}>{matches.map((item) => <button type="button" onClick={() => setSelected(item)} className={styles.crmResult} key={item.caseId}>
        <div><strong>{item.patient || "Patient unavailable"}</strong><span>{item.claimId ? `Claim ${item.claimId}` : `Order ${item.facts.orderId}`}</span></div><b>{item.claimStatus || "OPEN"}</b><small>{item.provider || "Provider pending"} · {item.payer || "Payer pending"}</small><em>View claim tracker →</em>
      </button>)}{query.trim() && !matches.length && !error ? <p className={styles.noResults}>No patient matches “{query.trim()}”.</p> : null}</div>
    </section>
  </main>;
}
