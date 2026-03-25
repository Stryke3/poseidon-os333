"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { signOut, useSession } from "next-auth/react"

import CommunicationsPanel from "@/components/dashboard/CommunicationsPanel"
import NeuralOsDashboard from "@/components/dashboard/NeuralOsDashboard"
import KanbanBoard from "@/components/kanban/KanbanBoard"
import LiveIngestDropzone from "@/components/ingest/LiveIngestDropzone"
import { queryTrident } from "@/lib/api"
import type { AccountRecord, KanbanCard, KanbanColumn } from "@/lib/data"

/* ── types ─────────────────────────────────────────── */

interface DashboardShellProps {
  initialKPIs: {
    cleanClaimRate: { value: number; delta: string; trend: string }
    daysInAR: { value: number; delta: string; trend: string }
    appealWinRate: { value: number; delta: string; trend: string }
    outstandingOrders: { value: number; urgent: number; trend: string }
  }
  initialPipeline: Record<string, { count: number; value: string }>
  initialAccounts: AccountRecord[]
  initialSystemState: {
    status: string
    services: string[]
    ports: string
    operators: string[]
    lastSync: string
  }
  initialKanban: Record<string, KanbanColumn>
  initialCommunications?: Array<Record<string, unknown>>
  initialIntegrations?: Record<string, unknown>
  variant?: "intake" | "executive" | "os" | "ceo"
}

type Variant = NonNullable<DashboardShellProps["variant"]>

const PIPELINE_ORDER = ["pendingAuth", "authorized", "submitted", "denied", "appealed", "paid"] as const

const COLUMN_LABELS: Record<string, string> = {
  pendingAuth: "Pending Auth",
  authorized: "Authorized",
  submitted: "Submitted",
  denied: "Denied",
  appealed: "Appealed",
  paid: "Paid",
}

const COLUMN_DOT: Record<string, string> = {
  pendingAuth: "bg-amber-400",
  authorized: "bg-blue-400",
  submitted: "bg-cyan-400",
  denied: "bg-red-400",
  appealed: "bg-purple-400",
  paid: "bg-emerald-400",
}

const STATUS_COLORS: Record<AccountRecord["status"], string> = {
  active: "bg-emerald-400/15 text-emerald-300",
  pending: "bg-amber-400/15 text-amber-300",
  appeal: "bg-purple-400/15 text-purple-300",
  denied: "bg-red-400/15 text-red-300",
}

const VARIANT_ACCENT: Record<Variant, { border: string; bg: string; text: string; kpi: string }> = {
  os: { border: "border-cyan-400/30", bg: "bg-cyan-400/10", text: "text-cyan-200", kpi: "text-cyan-300" },
  executive: { border: "border-blue-400/30", bg: "bg-blue-400/10", text: "text-blue-200", kpi: "text-blue-300" },
  ceo: { border: "border-amber-400/30", bg: "bg-amber-400/10", text: "text-amber-200", kpi: "text-amber-300" },
  intake: { border: "border-emerald-400/30", bg: "bg-emerald-400/10", text: "text-emerald-200", kpi: "text-emerald-300" },
}

const VARIANT_TITLES: Record<Variant, { title: string; subtitle: string }> = {
  os: { title: "Operations Deck", subtitle: "Live OS" },
  executive: { title: "Revenue Command", subtitle: "Executive" },
  ceo: { title: "Enterprise View", subtitle: "CEO" },
  intake: { title: "Intake Workspace", subtitle: "Intake" },
}

/* ── helpers ────────────────────────────────────────── */

function cn(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ")
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
}

function sumColumnValues(col: KanbanColumn | undefined) {
  if (!col) return 0
  return col.cards.reduce((s, c) => {
    const n = Number.parseFloat(c.value.replace(/[$,]/g, ""))
    return s + (Number.isFinite(n) ? n : 0)
  }, 0)
}

/* ── main shell ──────────────────────────────────────── */

export default function DashboardShell({
  initialKPIs,
  initialPipeline,
  initialAccounts,
  initialSystemState,
  initialKanban,
  initialCommunications = [],
  initialIntegrations = {},
  variant = "os",
}: DashboardShellProps) {
  // OS variant → dedicated NeuralOsDashboard
  if (variant === "os") {
    return (
      <NeuralOsDashboard
        initialAccounts={initialAccounts}
        initialCommunications={initialCommunications}
        initialIntegrations={initialIntegrations}
        initialKanban={initialKanban}
        initialKPIs={initialKPIs}
        initialSystemState={initialSystemState}
      />
    )
  }

  // All other variants share this shell
  return (
    <VariantShell
      variant={variant}
      initialKPIs={initialKPIs}
      initialPipeline={initialPipeline}
      initialAccounts={initialAccounts}
      initialSystemState={initialSystemState}
      initialKanban={initialKanban}
      initialCommunications={initialCommunications}
      initialIntegrations={initialIntegrations}
    />
  )
}

/* ── shared shell for exec/ceo/intake ───────────────── */

function VariantShell({
  variant,
  initialKPIs,
  initialPipeline,
  initialAccounts,
  initialSystemState,
  initialKanban,
  initialCommunications,
  initialIntegrations,
}: Omit<DashboardShellProps, "variant"> & { variant: Variant; initialCommunications: Array<Record<string, unknown>>; initialIntegrations: Record<string, unknown> }) {
  const { data: session } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [accounts, setAccounts] = useState(initialAccounts)
  const [kanban, setKanban] = useState(initialKanban)
  const [tridentOpen, setTridentOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [tridentResponse, setTridentResponse] = useState("Ask about queue status, denials, or reimbursement risk.")
  const [queryLoading, setQueryLoading] = useState(false)

  const userName = session?.user?.name || session?.user?.email || "Active Session"
  const userRole = session?.user?.role || "admin"
  const canManageUsers = session?.user?.role === "admin" || (session?.user?.permissions || []).includes("manage_users")
  const accent = VARIANT_ACCENT[variant]
  const titles = VARIANT_TITLES[variant]

  const normalizedSearch = search.trim().toLowerCase()

  const filteredAccounts = useMemo(() => {
    if (!normalizedSearch) return accounts
    return accounts.filter((a) =>
      [a.name, a.payer, a.id, a.type, a.value].filter(Boolean).some((v) => v.toLowerCase().includes(normalizedSearch)),
    )
  }, [accounts, normalizedSearch])

  const filteredKanban = useMemo(() => {
    if (!normalizedSearch) return kanban
    return Object.fromEntries(
      Object.entries(kanban).map(([k, col]) => [
        k,
        {
          ...col,
          cards: col.cards.filter((c) =>
            [c.title, c.payer, c.id, c.type, ...(c.orderIds || [])].filter(Boolean).some((v) => String(v).toLowerCase().includes(normalizedSearch)),
          ),
        },
      ]),
    )
  }, [kanban, normalizedSearch])

  const totalCards = PIPELINE_ORDER.reduce((s, k) => s + (kanban[k]?.cards.length || 0), 0)
  const totalValue = PIPELINE_ORDER.reduce((s, k) => s + sumColumnValues(kanban[k]), 0)
  const paidValue = sumColumnValues(kanban.paid)
  const deniedCount = (kanban.denied?.cards.length || 0) + (kanban.appealed?.cards.length || 0)
  const urgentCount = PIPELINE_ORDER.reduce((s, k) => s + (kanban[k]?.cards.filter((c) => c.priority === "high").length || 0), 0)
  const blockedCount = PIPELINE_ORDER.reduce((s, k) => s + (kanban[k]?.cards.filter((c) => c.locked).length || 0), 0)
  const collectionRate = totalValue > 0 ? Math.round((paidValue / totalValue) * 100) : 0

  const navItems = [
    { href: "/", label: "Live OS", active: variant === "os" },
    { href: "/executive", label: "Executive", active: variant === "executive" },
    { href: "/ceo", label: "CEO", active: variant === "ceo" },
    { href: "/intake", label: "Intake", active: variant === "intake" },
    { href: "/edi", label: "EDI", active: false },
    ...(canManageUsers ? [{ href: "/settings", label: "Settings", active: false }] : []),
  ]

  async function handleTridentSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!prompt.trim()) return
    setQueryLoading(true)
    try {
      const result = await queryTrident(prompt, {
        accounts: accounts.slice(0, 8).map((a) => ({ name: a.name, payer: a.payer, type: a.type, value: a.value })),
        pipeline: Object.fromEntries(Object.entries(kanban).map(([k, col]) => [k, col.cards.length])),
      })
      setTridentResponse(result.response || "No response.")
    } catch (err) {
      setTridentResponse(err instanceof Error ? err.message : "Unable to reach Trident.")
    } finally {
      setQueryLoading(false)
    }
  }

  function handleIngest(payload: { patients: AccountRecord[]; cards: KanbanCard[] }) {
    if (payload.patients.length) {
      setAccounts((prev) => {
        const merged = new Map<string, AccountRecord>()
        for (const a of [...payload.patients, ...prev]) merged.set(a.id, a)
        return Array.from(merged.values())
      })
    }
    if (payload.cards.length) {
      setKanban((prev) => ({
        ...prev,
        pendingAuth: {
          ...prev.pendingAuth,
          cards: Array.from(new Map([...payload.cards, ...prev.pendingAuth.cards].map((c) => [c.id, c])).values()),
        },
      }))
    }
  }

  return (
    <div className="min-h-screen text-white">
      {/* ── Top Bar ──────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[rgba(8,16,28,0.92)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[2200px] items-center gap-4 px-4 py-3">
          <button
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 transition hover:border-cyan-300/30 hover:bg-white/10"
            onClick={() => setMenuOpen(true)}
            type="button"
            aria-label="Open menu"
          >
            <span className="block h-0.5 w-5 rounded-full bg-slate-300" />
            <span className="block h-0.5 w-5 rounded-full bg-slate-300" />
            <span className="block h-0.5 w-5 rounded-full bg-slate-300" />
          </button>

          <div className="mr-4 hidden sm:block">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">Poseidon</p>
            <p className="text-sm font-semibold text-white">{titles.title}</p>
          </div>

          <label className="flex flex-1 max-w-xl items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition focus-within:border-cyan-300/40 focus-within:bg-white/8">
            <svg className="h-4 w-4 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
            <input
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient, payer, order..."
              type="search"
              value={search}
            />
          </label>

          <div className="hidden items-center gap-3 lg:flex">
            <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-300">{totalCards} cases</span>
            <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-300">{formatCurrency(totalValue)}</span>
            {urgentCount > 0 && <span className="rounded-md bg-red-400/15 px-2 py-1 font-mono text-[11px] text-red-300">{urgentCount} urgent</span>}
          </div>

          <button
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-medium transition",
              tridentOpen ? `${accent.border} ${accent.bg} ${accent.text}` : "border-white/10 bg-white/5 text-slate-300 hover:text-white",
            )}
            onClick={() => setTridentOpen((p) => !p)}
            type="button"
          >
            Trident AI
          </button>

          <div className="hidden items-center gap-2 md:flex">
            <div className="text-right">
              <p className="text-xs font-medium text-white">{userName}</p>
              <p className="font-mono text-[10px] text-slate-500">{String(userRole)}</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hamburger Menu ───────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-white/10 bg-[#0a1420] p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">Poseidon OS</p>
                <p className="mt-1 text-lg font-semibold text-white">Navigation</p>
              </div>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:text-white"
                onClick={() => setMenuOpen(false)}
                type="button"
              >
                ✕
              </button>
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  className={cn(
                    "block rounded-lg px-3 py-2.5 text-sm transition",
                    item.active ? `${accent.bg} ${accent.text} font-medium` : "text-slate-300 hover:bg-white/5 hover:text-white",
                  )}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-8 space-y-3">
              <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">System</p>
                <p className="mt-1 text-sm text-emerald-300">{initialSystemState.status}</p>
                <p className="mt-1 text-xs text-slate-400">Services: {initialSystemState.services.join(", ")}</p>
              </div>
              <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Pipeline</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  {PIPELINE_ORDER.map((k) => (
                    <div key={k} className="flex items-center justify-between">
                      <span className="text-slate-400">{COLUMN_LABELS[k]}</span>
                      <span className="text-white">{kanban[k]?.cards.length || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button
              className="mt-8 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-300 transition hover:border-red-400/30 hover:text-red-300"
              onClick={() => signOut({ callbackUrl: "/login" })}
              type="button"
            >
              Sign out
            </button>
          </aside>
        </div>
      )}

      {/* ── Variant Content ──────────────────────── */}
      {variant === "executive" && (
        <ExecutiveContent
          kpis={initialKPIs}
          pipeline={initialPipeline}
          accounts={filteredAccounts}
          kanban={filteredKanban}
          totalValue={totalValue}
          paidValue={paidValue}
          deniedCount={deniedCount}
          collectionRate={collectionRate}
          accent={accent}
        />
      )}

      {variant === "ceo" && (
        <CeoContent
          kpis={initialKPIs}
          accounts={filteredAccounts}
          kanban={kanban}
          totalCards={totalCards}
          totalValue={totalValue}
          paidValue={paidValue}
          collectionRate={collectionRate}
          urgentCount={urgentCount}
          blockedCount={blockedCount}
          accent={accent}
        />
      )}

      {variant === "intake" && (
        <IntakeContent
          kpis={initialKPIs}
          pipeline={initialPipeline}
          accounts={filteredAccounts}
          kanban={filteredKanban}
          communications={initialCommunications}
          integrations={initialIntegrations}
          onIngest={handleIngest}
          blockedCount={blockedCount}
          accent={accent}
        />
      )}

      {/* ── Trident Bar ──────────────────────────── */}
      {tridentOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[rgba(8,16,28,0.96)] backdrop-blur-xl">
          <div className="mx-auto max-w-[2200px] px-4 py-4">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <form className="flex gap-3" onSubmit={handleTridentSubmit}>
                  <input
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40"
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ask Trident: which queue needs attention? highest reimbursement risk?"
                    value={prompt}
                  />
                  <button
                    className={cn("rounded-lg border px-4 py-2.5 text-xs font-semibold transition hover:opacity-80 disabled:opacity-50", accent.border, accent.bg, accent.text)}
                    disabled={queryLoading}
                    type="submit"
                  >
                    {queryLoading ? "Running..." : "Ask"}
                  </button>
                </form>
              </div>
              <div className="w-px self-stretch bg-white/10" />
              <div className="max-h-24 min-w-[300px] max-w-md overflow-y-auto text-sm leading-6 text-slate-300">
                {tridentResponse}
              </div>
              <button className="rounded-lg border border-white/10 px-2 py-2 text-xs text-slate-400 hover:text-white" onClick={() => setTridentOpen(false)} type="button">✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   EXECUTIVE — Revenue focus
   ══════════════════════════════════════════════════════ */

function ExecutiveContent({
  kpis,
  pipeline,
  accounts,
  kanban,
  totalValue,
  paidValue,
  deniedCount,
  collectionRate,
  accent,
}: {
  kpis: DashboardShellProps["initialKPIs"]
  pipeline: DashboardShellProps["initialPipeline"]
  accounts: AccountRecord[]
  kanban: Record<string, KanbanColumn>
  totalValue: number
  paidValue: number
  deniedCount: number
  collectionRate: number
  accent: typeof VARIANT_ACCENT.executive
}) {
  return (
    <>
      {/* KPI strip */}
      <div className="border-b border-white/5 bg-[rgba(8,16,28,0.6)]">
        <div className="mx-auto flex max-w-[2200px] items-center gap-6 overflow-x-auto px-4 py-2.5">
          <KpiChip label="Pipeline Value" value={formatCurrency(totalValue)} sub={`${Object.values(pipeline).reduce((s, p) => s + p.count, 0)} orders`} color="text-blue-300" />
          <KpiChip label="Collected" value={formatCurrency(paidValue)} sub={`${collectionRate}% rate`} color="text-emerald-300" />
          <KpiChip label="Denied / Appealed" value={`${deniedCount}`} sub={kpis.cleanClaimRate.delta} color="text-red-300" />
          <KpiChip label="Appeal Win" value={`${kpis.appealWinRate.value}%`} sub={kpis.appealWinRate.delta} color="text-amber-300" />
        </div>
      </div>

      <div className="mx-auto max-w-[2200px] px-4 py-4 space-y-6">
        {/* Pipeline summary bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {PIPELINE_ORDER.map((k) => (
            <div key={k} className="rounded-lg border border-white/8 bg-[rgba(255,255,255,0.025)] p-3">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", COLUMN_DOT[k])} />
                <span className="text-xs font-medium text-white">{COLUMN_LABELS[k]}</span>
              </div>
              <p className="mt-2 text-xl font-semibold text-white">{pipeline[k]?.count || 0}</p>
              <p className="text-xs text-slate-500">{pipeline[k]?.value || "$0"}</p>
            </div>
          ))}
        </div>

        {/* Revenue by payer */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Revenue by Payer</h2>
          <PayerBreakdown accounts={accounts} />
        </section>

        {/* Patient roster sorted by value */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Patient Roster — {accounts.length} patients</h2>
          <PatientTable accounts={accounts} />
        </section>
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════
   CEO — Enterprise overview
   ══════════════════════════════════════════════════════ */

function CeoContent({
  kpis,
  accounts,
  kanban,
  totalCards,
  totalValue,
  paidValue,
  collectionRate,
  urgentCount,
  blockedCount,
  accent,
}: {
  kpis: DashboardShellProps["initialKPIs"]
  accounts: AccountRecord[]
  kanban: Record<string, KanbanColumn>
  totalCards: number
  totalValue: number
  paidValue: number
  collectionRate: number
  urgentCount: number
  blockedCount: number
  accent: typeof VARIANT_ACCENT.ceo
}) {
  const allCards = PIPELINE_ORDER.flatMap((k) => kanban[k]?.cards || [])
  const bizLines = ["dme", "implants", "biologics", "matia"] as const
  const bizData = bizLines.map((bl) => {
    const cards = allCards.filter((c) => c.businessLine === bl)
    const value = cards.reduce((s, c) => {
      const n = Number.parseFloat(c.value.replace(/[$,]/g, ""))
      return s + (Number.isFinite(n) ? n : 0)
    }, 0)
    return { id: bl, label: bl === "dme" ? "DME" : bl.charAt(0).toUpperCase() + bl.slice(1), count: cards.length, value }
  })

  const completionRate = totalCards > 0 ? Math.round(((kanban.paid?.cards.length || 0) / totalCards) * 100) : 0

  return (
    <>
      {/* KPI strip */}
      <div className="border-b border-white/5 bg-[rgba(8,16,28,0.6)]">
        <div className="mx-auto flex max-w-[2200px] items-center gap-6 overflow-x-auto px-4 py-2.5">
          <KpiChip label="Total Pipeline" value={formatCurrency(totalValue)} sub={`${totalCards} cases`} color="text-amber-300" />
          <KpiChip label="Collected" value={formatCurrency(paidValue)} sub={`${collectionRate}% collected`} color="text-emerald-300" />
          <KpiChip label="Completion" value={`${completionRate}%`} sub={`${kanban.paid?.cards.length || 0} resolved`} color="text-blue-300" />
          <KpiChip label="Risk Items" value={`${urgentCount + blockedCount}`} sub={`${urgentCount} urgent · ${blockedCount} blocked`} color="text-red-300" />
        </div>
      </div>

      <div className="mx-auto max-w-[2200px] px-4 py-4 space-y-6">
        {/* Business line cards */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Business Lines</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {bizData.map((bl) => (
              <div key={bl.id} className="rounded-lg border border-white/8 bg-[rgba(255,255,255,0.025)] p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{bl.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{bl.count}</p>
                <p className="mt-1 text-sm text-slate-400">{formatCurrency(bl.value)}</p>
                <div className="mt-3 h-1.5 rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-amber-400/60"
                    style={{ width: `${totalCards > 0 ? Math.round((bl.count / totalCards) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pipeline funnel */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Pipeline Funnel</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {PIPELINE_ORDER.map((k) => {
              const count = kanban[k]?.cards.length || 0
              const value = sumColumnValues(kanban[k])
              return (
                <div key={k} className="rounded-lg border border-white/8 bg-[rgba(255,255,255,0.025)] p-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", COLUMN_DOT[k])} />
                    <span className="text-xs font-medium text-white">{COLUMN_LABELS[k]}</span>
                  </div>
                  <p className="mt-2 text-xl font-semibold text-white">{count}</p>
                  <p className="text-xs text-slate-500">{formatCurrency(value)}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Top patients by value */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Top Patients by Value</h2>
          <PatientTable accounts={accounts} />
        </section>
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════
   INTAKE — Operational intake workspace
   ══════════════════════════════════════════════════════ */

function IntakeContent({
  kpis,
  pipeline,
  accounts,
  kanban,
  communications,
  integrations,
  onIngest,
  blockedCount,
  accent,
}: {
  kpis: DashboardShellProps["initialKPIs"]
  pipeline: DashboardShellProps["initialPipeline"]
  accounts: AccountRecord[]
  kanban: Record<string, KanbanColumn>
  communications: Array<Record<string, unknown>>
  integrations: Record<string, unknown>
  onIngest: (payload: { patients: AccountRecord[]; cards: KanbanCard[] }) => void
  blockedCount: number
  accent: typeof VARIANT_ACCENT.intake
}) {
  const pendingCount = kanban.pendingAuth?.cards.length || 0
  const authCount = kanban.authorized?.cards.length || 0
  const ordersToPlace = pendingCount + authCount

  return (
    <>
      {/* KPI strip */}
      <div className="border-b border-white/5 bg-[rgba(8,16,28,0.6)]">
        <div className="mx-auto flex max-w-[2200px] items-center gap-6 overflow-x-auto px-4 py-2.5">
          <KpiChip label="Pending Auth" value={`${pendingCount}`} sub="awaiting authorization" color="text-amber-300" />
          <KpiChip label="Orders to Place" value={`${ordersToPlace}`} sub="intake + authorized" color="text-cyan-300" />
          <KpiChip label="Blocked" value={`${blockedCount}`} sub="verification needed" color="text-red-300" />
          <KpiChip label="Total Queue" value={`${kpis.outstandingOrders.value}`} sub={`${kpis.outstandingOrders.urgent} urgent`} color="text-emerald-300" />
        </div>
      </div>

      <div className="mx-auto max-w-[2200px] px-4 py-4 space-y-6">
        {/* CSV Ingest */}
        <LiveIngestDropzone onIngested={onIngest} />

        {/* Pipeline summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {PIPELINE_ORDER.map((k) => (
            <div key={k} className="rounded-lg border border-white/8 bg-[rgba(255,255,255,0.025)] p-3">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", COLUMN_DOT[k])} />
                <span className="text-xs font-medium text-white">{COLUMN_LABELS[k]}</span>
              </div>
              <p className="mt-2 text-xl font-semibold text-white">{pipeline[k]?.count || 0}</p>
              <p className="text-xs text-slate-500">{pipeline[k]?.value || "$0"}</p>
            </div>
          ))}
        </div>

        {/* Kanban worklist */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Intake Worklist</h2>
          <KanbanBoard initialColumns={kanban} />
        </section>

        {/* Patient list + Communications side by side */}
        <div className="grid gap-6 xl:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-white">Patients — {accounts.length}</h2>
            <PatientTable accounts={accounts} />
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-white">Communications</h2>
            <div className="rounded-lg border border-white/8 bg-[rgba(255,255,255,0.025)] p-4">
              <CommunicationsPanel initialItems={communications} integrations={integrations} />
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════
   SHARED COMPONENTS
   ══════════════════════════════════════════════════════ */

function KpiChip({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="flex flex-shrink-0 items-center gap-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
        <p className={cn("text-lg font-semibold leading-tight", color)}>{value}</p>
      </div>
      <span className="text-[11px] text-slate-500">{sub}</span>
    </div>
  )
}

function PatientTable({ accounts }: { accounts: AccountRecord[] }) {
  const sorted = useMemo(() => {
    return [...accounts].sort((a, b) => {
      const av = Number.parseFloat(a.value.replace(/[$,]/g, "")) || 0
      const bv = Number.parseFloat(b.value.replace(/[$,]/g, "")) || 0
      return bv - av
    })
  }, [accounts])

  if (!sorted.length) {
    return <div className="rounded-lg border border-white/8 bg-white/[0.02] p-4 text-sm text-slate-500">No patients matched.</div>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/8">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 bg-[rgba(255,255,255,0.02)]">
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Patient</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Payer</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Type</th>
            <th className="px-3 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Status</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Value</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Orders</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((a) => (
            <tr key={a.id} className="border-b border-white/[0.03] transition hover:bg-white/[0.02]">
              <td className="px-3 py-2.5">
                <Link href={a.href || `/patients/${a.id}`} className="text-sm font-medium text-white hover:text-cyan-200 transition">
                  {a.name}
                </Link>
                <p className="text-[10px] text-slate-500">{a.id}</p>
              </td>
              <td className="px-3 py-2.5 text-slate-300">{a.payer}</td>
              <td className="px-3 py-2.5 text-slate-400 text-xs">{a.type}</td>
              <td className="px-3 py-2.5">
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase", STATUS_COLORS[a.status])}>
                  {a.status}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-medium text-white">{a.value}</td>
              <td className="px-3 py-2.5 text-right text-slate-400">{a.orderCount || 1}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PayerBreakdown({ accounts }: { accounts: AccountRecord[] }) {
  const payers = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>()
    for (const a of accounts) {
      const existing = map.get(a.payer) || { count: 0, value: 0 }
      existing.count += a.orderCount || 1
      existing.value += Number.parseFloat(a.value.replace(/[$,]/g, "")) || 0
      map.set(a.payer, existing)
    }
    return Array.from(map.entries())
      .map(([payer, data]) => ({ payer, ...data }))
      .sort((a, b) => b.value - a.value)
  }, [accounts])

  const maxValue = payers[0]?.value || 1

  return (
    <div className="space-y-2">
      {payers.map((p) => (
        <div key={p.payer} className="rounded-lg border border-white/8 bg-[rgba(255,255,255,0.025)] p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-medium text-white">{p.payer}</span>
              <span className="ml-2 text-xs text-slate-500">{p.count} orders</span>
            </div>
            <span className="text-sm font-semibold text-white">{formatCurrency(p.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5">
            <div className="h-full rounded-full bg-blue-400/50" style={{ width: `${Math.round((p.value / maxValue) * 100)}%` }} />
          </div>
        </div>
      ))}
      {!payers.length && <div className="text-sm text-slate-500">No payer data available.</div>}
    </div>
  )
}
