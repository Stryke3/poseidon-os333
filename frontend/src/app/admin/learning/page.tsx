"use client"

import Link from "next/link"

const cards = [
  {
    href: "/admin/learning/manuals",
    title: "Manuals",
    body: "Ingest, preview extraction, list payer manuals (BFF: /api/learning).",
  },
  {
    href: "/admin/learning/extraction-review",
    title: "Extraction review",
    body: "Open a manual, re-run structured extraction, inspect requirements and review state.",
  },
  {
    href: "/admin/learning/recommendations",
    title: "Recommendations",
    body: "Governance queue, learning evaluation, approve/reject, draft artifacts.",
  },
  {
    href: "/admin/learning/playbook-performance",
    title: "Playbook performance",
    body: "Rolled-up metrics and draft learned suggestions.",
  },
]

export default function LearningAdminHubPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="glass-panel-strong cockpit-sheen hud-outline rounded-[32px] p-5 sm:p-6">
        <p className="mb-3 inline-flex items-center rounded-full border border-[rgba(142,197,255,0.35)] bg-[rgba(118,243,255,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#a8dcff]">
          Learning
        </p>
        <h1 className="font-display text-4xl uppercase tracking-[0.1em] text-white sm:text-5xl">Learning</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300/95">
          Payer manual ingestion, extraction review, recommendations, and playbook performance.
        </p>
      </header>
      <ul className="grid gap-4">
        {cards.map((c) => (
          <li key={c.href}>
            <Link
              href={c.href}
              className="glass-panel block rounded-[28px] p-5 transition hover:border-[rgba(142,197,255,0.35)]"
            >
              <h2 className="font-semibold text-white">{c.title}</h2>
              <p className="mt-1 text-sm text-slate-300/95">{c.body}</p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">
        Legacy hub:{" "}
        <Link href="/admin/governance" className="text-slate-400 underline hover:text-slate-200">
          /admin/governance
        </Link>
      </p>
    </div>
  )
}
