"use client"

import Link from "next/link"

const cards = [
  {
    href: "/admin/governance/manuals",
    title: "Manual extraction review",
    body: "Ingest payer manuals from the Trident manuals tree, preview deterministic extracts, and inspect baseline requirements.",
  },
  {
    href: "/admin/validation/pre-submit",
    title: "Pre-submit validation",
    body: "Run deterministic packet validation against payer manuals, payer rules, and playbook output before submission.",
  },
  {
    href: "/admin/governance/recommendations",
    title: "Governance queue",
    body: "Pending governed recommendations with evidence links. Approve or reject — no automatic production changes.",
  },
  {
    href: "/admin/governance/performance",
    title: "Playbook performance",
    body: "Rolled-up approval, denial, turnaround, and rework metrics by playbook version and scope.",
  },
]

export default function GovernanceHubPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="glass-panel-strong cockpit-sheen hud-outline rounded-[32px] p-5 sm:p-6">
        <p className="mb-3 inline-flex items-center rounded-full border border-[rgba(142,197,255,0.35)] bg-[rgba(118,243,255,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#a8dcff]">
          Governance
        </p>
        <h1 className="font-display text-4xl uppercase tracking-[0.1em] text-white sm:text-5xl">Learning &amp; governance</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300/95">
          Outcome-driven evaluation and governed recommendations. Manual-derived rules stay authoritative;
          learned items flow through approval only.
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
        API base (Node): <code className="text-slate-400">/api/intelligence/governance</code> · BFF:{" "}
        <code className="text-slate-400">/api/governance/…</code>
      </p>
    </div>
  )
}
