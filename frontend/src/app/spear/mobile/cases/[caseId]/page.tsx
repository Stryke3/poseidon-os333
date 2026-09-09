import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCase } from "@/lib/poseidon-store";
import { requireSpearPageAuth } from "@/lib/spear-auth";
import { buildClaimTracker } from "@/lib/spear-mobile";
import styles from "../../mobile.module.css";

export const dynamic = "force-dynamic";

export default async function MobileClaimPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  await requireSpearPageAuth(`/spear/mobile/cases/${caseId}`);
  const record = await getCase(caseId);
  if (!record) notFound();
  const tracker = buildClaimTracker(record);

  return <main className={styles.app}>
    <Link href="/spear/mobile" className={styles.backLink}><ArrowLeft size={17}/> Patient search</Link>
    <header className={styles.claimHeader}>
      <span className={styles.eyebrow}>PATIENT CLAIM</span>
      <h1>{record.patient_name || "Patient unavailable"}</h1>
      <p>{String(record.claim_id || record.order_id || record.id)} · {record.payer || "Payer pending"}</p>
    </header>
    <section className={styles.claimFacts}>
      <div><span>Provider</span><strong>{record.provider || "Pending"}</strong></div>
      <div><span>Product</span><strong>{record.product || "Pending"}</strong></div>
      <div><span>DOS</span><strong>{String(record.scheduled_dos || record.order_date || "Pending")}</strong></div>
      <div><span>Rep</span><strong>{String(record.assigned_to || record.assignee || "Unassigned")}</strong></div>
    </section>
    <section className={styles.tracker} aria-label="Claim progress">
      {tracker.map((item, index) => <article className={`${styles.trackerStep} ${styles[item.status]}`} key={item.key}>
        <div className={styles.trackerRail}><span>{index + 1}</span>{index < tracker.length - 1 ? <i/> : null}</div>
        <div className={styles.trackerCard}><div><h2>{item.label}</h2><b>{item.status === "complete" ? "Complete" : item.status === "blocked" ? "Needs attention" : "Pending"}</b></div><p>{item.detail}</p></div>
      </article>)}
    </section>
  </main>;
}
