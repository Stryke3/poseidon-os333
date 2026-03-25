"use client"

/**
 * EDI Command Surface — 837P claim submissions + 835 remittance + denial worklist.
 * Fetches from /api/edi proxy which forwards to poseidon_edi:8006.
 */

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"

import type {
  ClaimSubmission,
  DenialItem,
  EdiHealthResponse,
  RemittanceBatch,
  RemittanceStats,
} from "@/lib/edi-api"
import {
  getClaimSubmissions,
  getDenialWorklist,
  getEdiHealth,
  getRemittanceBatches,
  getRemittanceStats,
} from "@/lib/edi-api"

import styles from "./EdiCommandSurface.module.css"

type ViewKey = "overview" | "claims" | "remittance" | "denials"

function fmt$(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "$0"
  return `$${Math.round(v).toLocaleString()}`
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "0%"
  return `${v.toFixed(1)}%`
}

function statusColor(status: string): string {
  switch (status) {
    case "accepted":
    case "paid":
    case "posted":
    case "parsed":
      return "bg-emerald-500/20 text-emerald-400"
    case "submitted":
    case "validated":
      return "bg-sky-500/20 text-sky-400"
    case "rejected":
    case "failed":
    case "denied":
      return "bg-red-500/20 text-red-400"
    case "dry_run":
      return "bg-amber-500/20 text-amber-400"
    default:
      return "bg-zinc-500/20 text-zinc-400"
  }
}

function categoryColor(cat: string): string {
  switch (cat) {
    case "eligibility":
      return "#a78bfa"
    case "medical_necessity":
      return "#f87171"
    case "authorization":
      return "#fbbf24"
    case "coding":
      return "#38bdf8"
    case "timely_filing":
      return "#fb923c"
    case "duplicate":
      return "#94a3b8"
    case "coordination":
      return "#2dd4bf"
    case "contractual":
      return "#6b7280"
    default:
      return "#a1a1aa"
  }
}

function actionLabel(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function EdiCommandSurface() {
  const { data: session } = useSession()
  const [view, setView] = useState<ViewKey>("overview")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState("00:00:00")

  const [health, setHealth] = useState<EdiHealthResponse | null>(null)
  const [stats, setStats] = useState<RemittanceStats | null>(null)
  const [submissions, setSubmissions] = useState<ClaimSubmission[]>([])
  const [submissionsTotal, setSubmissionsTotal] = useState(0)
  const [batches, setBatches] = useState<RemittanceBatch[]>([])
  const [batchesTotal, setBatchesTotal] = useState(0)
  const [denials, setDenials] = useState<DenialItem[]>([])
  const [denialCategories, setDenialCategories] = useState<
    Record<string, { count: number; total_amount: number }>
  >({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [h, s, sub, bat, den] = await Promise.all([
          getEdiHealth().catch(() => null),
          getRemittanceStats(30).catch(() => null),
          getClaimSubmissions(100).catch(() => ({ total: 0, submissions: [] })),
          getRemittanceBatches(50).catch(() => ({ total: 0, batches: [] })),
          getDenialWorklist(100).catch(() => ({
            total: 0,
            denials: [] as DenialItem[],
            by_category: {} as Record<string, { count: number; total_amount: number }>,
          })),
        ])
        if (cancelled) return
        setHealth(h)
        setStats(s)
        setSubmissions(sub.submissions)
        setSubmissionsTotal(sub.total)
        setBatches(bat.batches)
        setBatchesTotal(bat.total)
        setDenials(den.denials)
        setDenialCategories(den.by_category)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load EDI data")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      )
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  const views: { key: ViewKey; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "claims", label: "837P Claims" },
    { key: "remittance", label: "835 Remittance" },
    { key: "denials", label: "Denial Worklist" },
  ]

  const summary = stats?.summary

  return (
    <div className={`${styles.surface} relative min-h-screen overflow-hidden`}>
      <div className={styles.circleBg} />

      <div className="relative z-10 mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className={`${styles.mono} text-xs uppercase tracking-widest text-sky-400`}>
              POSEIDON EDI
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Claims &amp; Remittance
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {health && (
              <span
                className={`${styles.mono} rounded-full px-3 py-1 text-xs font-semibold ${
                  health.database === "connected"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-red-500/15 text-red-400"
                }`}
              >
                {health.dry_run ? "DRY RUN" : health.stedi === "connected" ? "LIVE" : "OFFLINE"}
              </span>
            )}
            <span className={`${styles.mono} text-sm text-zinc-500`}>{clock}</span>
          </div>
        </header>

        {/* Tab Bar */}
        <nav className="mb-6 flex gap-1 rounded-xl border border-white/5 bg-white/[0.02] p-1">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={`${styles.tabBtn} rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                view === v.key
                  ? styles.tabBtnActive
                  : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200"
              }`}
            >
              {v.label}
            </button>
          ))}
        </nav>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            <span className="ml-3 text-sm text-zinc-400">Loading EDI data...</span>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <p className="mt-1 text-xs text-zinc-500">
              Check that the EDI service is running on port 8006
            </p>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* OVERVIEW */}
            {view === "overview" && (
              <div className="space-y-6">
                {/* KPI Grid */}
                <div className={`grid gap-4 ${styles.metricGrid}`}>
                  {[
                    {
                      label: "Collection Rate",
                      value: fmtPct(summary?.collection_rate),
                      sub: `${summary?.total_claims ?? 0} claims processed`,
                      color: (summary?.collection_rate ?? 0) >= 80 ? "#4ade80" : "#fbbf24",
                    },
                    {
                      label: "Denial Rate",
                      value: fmtPct(summary?.denial_rate),
                      sub: `${summary?.total_denials ?? 0} denials`,
                      color: (summary?.denial_rate ?? 0) <= 10 ? "#4ade80" : "#f87171",
                    },
                    {
                      label: "Total Billed",
                      value: fmt$(summary?.total_billed),
                      sub: `${summary?.batch_count ?? 0} batches`,
                      color: "#38bdf8",
                    },
                    {
                      label: "Total Paid",
                      value: fmt$(summary?.total_paid),
                      sub: `${summary?.total_partial ?? 0} partial pays`,
                      color: "#4ade80",
                    },
                  ].map((m) => (
                    <div key={m.label} className={`${styles.glossCard} p-5`}>
                      <div className={styles.gloss} />
                      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                        {m.label}
                      </p>
                      <p
                        className={`${styles.mono} mt-1 text-2xl font-bold`}
                        style={{ color: m.color }}
                      >
                        {m.value}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{m.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Two-column: Top Denials + Payer Exposure */}
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Top Denial Codes */}
                  <div className={`${styles.glossCard} p-5`}>
                    <div className={styles.gloss} />
                    <h3 className="mb-4 text-sm font-semibold text-zinc-300">
                      Top Denial Codes (30d)
                    </h3>
                    {stats?.top_denial_codes?.length ? (
                      <div className="space-y-2">
                        {stats.top_denial_codes.slice(0, 8).map((d) => (
                          <div
                            key={`${d.carc_code}-${d.denial_category}`}
                            className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: categoryColor(d.denial_category) }}
                              />
                              <span className={`${styles.mono} text-sm text-zinc-300`}>
                                CARC {d.carc_code}
                              </span>
                              <span className="text-xs text-zinc-500">{d.denial_category}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs text-zinc-400">{d.count}x</span>
                              <span className={`${styles.mono} text-sm text-red-400`}>
                                {fmt$(d.total_amount)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-8 text-center text-xs text-zinc-600">
                        No denial data yet
                      </p>
                    )}
                  </div>

                  {/* Payer Exposure */}
                  <div className={`${styles.glossCard} p-5`}>
                    <div className={styles.gloss} />
                    <h3 className="mb-4 text-sm font-semibold text-zinc-300">
                      Payer Exposure (30d)
                    </h3>
                    {stats?.by_payer?.length ? (
                      <div className="space-y-2">
                        {stats.by_payer.slice(0, 8).map((p) => {
                          const denialPct =
                            p.claims > 0 ? ((p.denials / p.claims) * 100).toFixed(1) : "0"
                          return (
                            <div
                              key={p.payer_name}
                              className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2"
                            >
                              <div>
                                <p className="text-sm text-zinc-300">
                                  {p.payer_name || "Unknown"}
                                </p>
                                <p className="text-xs text-zinc-500">{p.claims} claims</p>
                              </div>
                              <div className="text-right">
                                <p className={`${styles.mono} text-sm text-emerald-400`}>
                                  {fmt$(p.paid)}
                                </p>
                                <p className="text-xs text-zinc-500">{denialPct}% denied</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="py-8 text-center text-xs text-zinc-600">No payer data yet</p>
                    )}
                  </div>
                </div>

                {/* Submission count + batch count summary */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className={`${styles.glossCard} p-5`}>
                    <div className={styles.gloss} />
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      837P Submissions
                    </p>
                    <p className={`${styles.mono} mt-1 text-3xl font-bold text-sky-400`}>
                      {submissionsTotal}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">total claim submissions</p>
                  </div>
                  <div className={`${styles.glossCard} p-5`}>
                    <div className={styles.gloss} />
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      835 Batches
                    </p>
                    <p className={`${styles.mono} mt-1 text-3xl font-bold text-violet-400`}>
                      {batchesTotal}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">remittance batches ingested</p>
                  </div>
                </div>
              </div>
            )}

            {/* CLAIMS */}
            {view === "claims" && (
              <div className={`${styles.glossCard} overflow-hidden`}>
                <div className={styles.gloss} />
                <div className="border-b border-white/5 p-5">
                  <h3 className="text-sm font-semibold text-zinc-300">
                    837P Claim Submissions ({submissionsTotal})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-zinc-500">
                        <th className="px-5 py-3">Claim #</th>
                        <th className="px-5 py-3">ICN</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Stedi TX</th>
                        <th className="px-5 py-3">Batch</th>
                        <th className="px-5 py-3">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-5 py-12 text-center text-zinc-600">
                            No submissions yet
                          </td>
                        </tr>
                      )}
                      {submissions.map((s) => (
                        <tr
                          key={s.id}
                          className={`${styles.tableRow} border-b border-white/[0.03] transition-colors`}
                        >
                          <td className={`${styles.mono} px-5 py-3 text-zinc-300`}>
                            {s.claim_number || s.id.slice(0, 8)}
                          </td>
                          <td className={`${styles.mono} px-5 py-3 text-zinc-400`}>
                            {s.interchange_control_number}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`${styles.statusBadge} ${statusColor(s.status)}`}>
                              {s.status}
                            </span>
                          </td>
                          <td className={`${styles.mono} px-5 py-3 text-xs text-zinc-500`}>
                            {s.stedi_transaction_id?.slice(0, 16) || "—"}
                          </td>
                          <td className="px-5 py-3 text-xs text-zinc-500">
                            {s.batch_id || "—"}
                          </td>
                          <td className="px-5 py-3 text-xs text-zinc-500">
                            {s.submitted_at
                              ? new Date(s.submitted_at).toLocaleDateString()
                              : s.created_at
                                ? new Date(s.created_at).toLocaleDateString()
                                : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* REMITTANCE */}
            {view === "remittance" && (
              <div className={`${styles.glossCard} overflow-hidden`}>
                <div className={styles.gloss} />
                <div className="border-b border-white/5 p-5">
                  <h3 className="text-sm font-semibold text-zinc-300">
                    835 Remittance Batches ({batchesTotal})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-zinc-500">
                        <th className="px-5 py-3">Payer</th>
                        <th className="px-5 py-3">Check #</th>
                        <th className="px-5 py-3">Total Paid</th>
                        <th className="px-5 py-3">Claims</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-5 py-12 text-center text-zinc-600">
                            No batches yet
                          </td>
                        </tr>
                      )}
                      {batches.map((b) => (
                        <tr
                          key={b.id}
                          className={`${styles.tableRow} border-b border-white/[0.03] transition-colors`}
                        >
                          <td className="px-5 py-3 text-zinc-300">
                            {b.payer_name || "Unknown"}
                          </td>
                          <td className={`${styles.mono} px-5 py-3 text-zinc-400`}>
                            {b.check_number || "—"}
                          </td>
                          <td className={`${styles.mono} px-5 py-3 text-emerald-400`}>
                            {fmt$(b.total_paid)}
                          </td>
                          <td className="px-5 py-3 text-zinc-400">{b.claim_count}</td>
                          <td className="px-5 py-3">
                            <span className={`${styles.statusBadge} ${statusColor(b.status)}`}>
                              {b.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-zinc-500">
                            {new Date(b.received_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* DENIALS */}
            {view === "denials" && (
              <div className="space-y-6">
                {/* Category breakdown */}
                {Object.keys(denialCategories).length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(denialCategories)
                      .sort(([, a], [, b]) => b.count - a.count)
                      .map(([cat, data]) => (
                        <div
                          key={cat}
                          className={`${styles.glossCard} flex items-center gap-3 px-4 py-3`}
                        >
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ background: categoryColor(cat) }}
                          />
                          <div>
                            <p className="text-xs font-semibold text-zinc-300">
                              {cat.replace(/_/g, " ")}
                            </p>
                            <p className={`${styles.mono} text-xs text-zinc-500`}>
                              {data.count}x &middot; {fmt$(data.total_amount)}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Denial table */}
                <div className={`${styles.glossCard} overflow-hidden`}>
                  <div className={styles.gloss} />
                  <div className="border-b border-white/5 p-5">
                    <h3 className="text-sm font-semibold text-zinc-300">
                      Actionable Denials ({denials.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-zinc-500">
                          <th className="px-5 py-3">Patient</th>
                          <th className="px-5 py-3">PCN</th>
                          <th className="px-5 py-3">Payer</th>
                          <th className="px-5 py-3">Billed</th>
                          <th className="px-5 py-3">CARC</th>
                          <th className="px-5 py-3">Category</th>
                          <th className="px-5 py-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {denials.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-5 py-12 text-center text-zinc-600">
                              No denials found
                            </td>
                          </tr>
                        )}
                        {denials.map((d, i) => (
                          <tr
                            key={`${d.id}-${i}`}
                            className={`${styles.tableRow} border-b border-white/[0.03] transition-colors`}
                          >
                            <td className="px-5 py-3 text-zinc-300">
                              {[d.patient_first_name, d.patient_last_name]
                                .filter(Boolean)
                                .join(" ") || "—"}
                            </td>
                            <td className={`${styles.mono} px-5 py-3 text-xs text-zinc-400`}>
                              {d.patient_control_number || "—"}
                            </td>
                            <td className="px-5 py-3 text-zinc-400">
                              {d.payer_name || "—"}
                            </td>
                            <td className={`${styles.mono} px-5 py-3 text-zinc-300`}>
                              {fmt$(d.billed_amount)}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`${styles.mono} rounded bg-white/5 px-2 py-0.5 text-xs`}
                              >
                                {d.carc_code || "—"}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              {d.denial_category && (
                                <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{
                                      background: categoryColor(d.denial_category),
                                    }}
                                  />
                                  {d.denial_category.replace(/_/g, " ")}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-xs text-sky-400">
                              {d.suggested_action ? actionLabel(d.suggested_action) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
