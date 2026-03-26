"use client"

import Link from "next/link"
import React, { type ComponentProps } from "react"
import { useEffect, useMemo, useState } from "react"
import { signOut, useSession } from "next-auth/react"

import CommunicationsPanel from "@/components/dashboard/CommunicationsPanel"
import { queryTrident } from "@/lib/api"
import type { AccountRecord, KanbanCard, KanbanColumn } from "@/lib/data"

/* ── types ─────────────────────────────────────────── */

type DashboardKpis = {
  cleanClaimRate: { value: number; delta: string; trend: string }
  daysInAR: { value: number; delta: string; trend: string }
  appealWinRate: { value: number; delta: string; trend: string }
  outstandingOrders: { value: number; urgent: number; trend: string }
}

type SystemState = {
  status: string
  services: string[]
  ports: string
  operators: string[]
  lastSync: string
}

type BusinessLineId = "all" | "dme" | "implants" | "biologics" | "matia"

const PIPELINE_ORDER = [
  "pendingAuth",
  "authorized",
  "submitted",
  "denied",
  "appealed",
  "paid",
] as const

const COLUMN_LABELS: Record<string, string> = {
  pendingAuth: "Pending Auth",
  authorized: "Authorized",
  submitted: "Submitted",
  denied: "Denied",
  appealed: "Appealed",
  paid: "Paid",
}

const COLUMN_COLORS: Record<string, string> = {
  pendingAuth: "border-amber-400/50 text-amber-300",
  authorized: "border-blue-400/50 text-blue-300",
  submitted: "border-cyan-400/50 text-cyan-300",
  denied: "border-red-400/50 text-red-300",
  appealed: "border-purple-400/50 text-purple-300",
  paid: "border-emerald-400/50 text-emerald-300",
}

const COLUMN_DOT: Record<string, string> = {
  pendingAuth: "bg-amber-400",
  authorized: "bg-blue-400",
  submitted: "bg-cyan-400",
  denied: "bg-red-400",
  appealed: "bg-purple-400",
  paid: "bg-emerald-400",
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "border-red-400/40 bg-red-400/15 text-red-200",
  med: "border-amber-400/40 bg-amber-400/15 text-amber-200",
  low: "border-slate-400/30 bg-slate-400/10 text-slate-300",
}

const businessLineTabs: Array<{ id: BusinessLineId; label: string }> = [
  { id: "all", label: "All" },
  { id: "dme", label: "DME" },
  { id: "implants", label: "Implants" },
  { id: "biologics", label: "Biologics" },
  { id: "matia", label: "Matia" },
]

/* ── helpers ────────────────────────────────────────── */

function cn(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ")
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDateLabel(value: string) {
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function sumCardValues(cards: KanbanCard[]) {
  return cards.reduce((sum, card) => {
    const numeric = Number.parseFloat(card.value.replace(/[$,]/g, ""))
    return sum + (Number.isFinite(numeric) ? numeric : 0)
  }, 0)
}

function cardMatches(card: KanbanCard, query: string) {
  if (!query) return true
  return [card.title, card.value, card.payer, card.type, card.id, card.patientId, card.assignee, ...(card.orderIds || [])]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(query))
}

function cardMatchesBusinessLine(card: KanbanCard, bl: BusinessLineId) {
  if (bl === "all") return true
  return card.businessLine === bl
}

/* ── component ──────────────────────────────────────── */

export default function NeuralOsDashboard({
  initialKPIs,
  initialAccounts,
  initialSystemState,
  initialKanban,
  initialCommunications = [],
  initialIntegrations = {},
  initialBusinessLine = "all",
}: {
  initialKPIs: DashboardKpis
  initialAccounts: AccountRecord[]
  initialSystemState: SystemState
  initialCommunications?: Array<Record<string, unknown>>
  initialIntegrations?: Record<string, unknown>
  initialKanban: Record<string, KanbanColumn>
  initialBusinessLine?: BusinessLineId
}) {
  const { data: session } = useSession()
  const [search, setSearch] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [tridentOpen, setTridentOpen] = useState(false)
  const [activeBusinessLine, setActiveBusinessLine] = useState<BusinessLineId>(initialBusinessLine)
  const [columns, setColumns] = useState(initialKanban)
  const [prompt, setPrompt] = useState("")
  const [tridentResponse, setTridentResponse] = useState("Ask about queue status, denials, or reimbursement risk.")
  const [queryLoading, setQueryLoading] = useState(false)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ cardId: string; columnId: string } | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  const userName = session?.user?.name || session?.user?.email || "Active Session"
  const userRole = session?.user?.role || "admin"
  const canManageUsers = session?.user?.role === "admin" || (session?.user?.permissions || []).includes("manage_users")
  const matiaUrl = process.env.NEXT_PUBLIC_MATIA_DASHBOARD_URL || "/matia"

  useEffect(() => {
    setColumns(initialKanban)
  }, [initialKanban])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault()
        document.getElementById("poseidon-search")?.focus()
      }
      if (e.key === "Escape") {
        setMenuOpen(false)
        setExpandedCard(null)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  const normalizedSearch = search.trim().toLowerCase()

  // Filter columns by business line + search
  const filteredColumns = useMemo(() => {
    const result: Record<string, KanbanColumn> = {}
    for (const key of PIPELINE_ORDER) {
      const col = columns[key]
      if (!col) continue
      const cards = col.cards
        .filter((c) => cardMatchesBusinessLine(c, activeBusinessLine))
        .filter((c) => cardMatches(c, normalizedSearch))
      result[key] = { ...col, cards }
    }
    return result
  }, [columns, activeBusinessLine, normalizedSearch])

  const totalCards = PIPELINE_ORDER.reduce((s, k) => s + (filteredColumns[k]?.cards.length || 0), 0)
  const totalValue = PIPELINE_ORDER.reduce((s, k) => s + sumCardValues(filteredColumns[k]?.cards || []), 0)
  const urgentCards = PIPELINE_ORDER.reduce(
    (s, k) => s + (filteredColumns[k]?.cards.filter((c) => c.priority === "high").length || 0),
    0,
  )
  const blockedCards = PIPELINE_ORDER.reduce(
    (s, k) => s + (filteredColumns[k]?.cards.filter((c) => c.locked).length || 0),
    0,
  )

  /* drag and drop */
  function handleDrop(targetColumnId: string) {
    if (!dragging || dragging.columnId === targetColumnId) {
      setDragging(null)
      setDragOverColumn(null)
      return
    }
    setColumns((prev) => {
      const sourceCol = prev[dragging.columnId]
      const card = sourceCol?.cards.find((c) => c.id === dragging.cardId)
      if (!sourceCol || !card) return prev
      return {
        ...prev,
        [dragging.columnId]: { ...sourceCol, cards: sourceCol.cards.filter((c) => c.id !== dragging.cardId) },
        [targetColumnId]: { ...prev[targetColumnId], cards: [...prev[targetColumnId].cards, card] },
      }
    })
    setDragging(null)
    setDragOverColumn(null)
  }

  /* trident */
  async function handleTridentSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!prompt.trim()) return
    setQueryLoading(true)
    try {
      const result = await queryTrident(prompt, {
        accounts: initialAccounts.slice(0, 8).map((a) => ({ name: a.name, payer: a.payer, type: a.type, value: a.value })),
        pipeline: Object.fromEntries(PIPELINE_ORDER.map((k) => [k, filteredColumns[k]?.cards.length || 0])),
      })
      setTridentResponse(result.response || "No response.")
    } catch (err) {
      setTridentResponse(err instanceof Error ? err.message : "Unable to reach Trident.")
    } finally {
      setQueryLoading(false)
    }
  }

  /* nav items */
  const navItems = [
    { href: "/", label: "Live OS", active: true },
    { href: "/executive", label: "Executive", active: false },
    { href: "/ceo", label: "CEO", active: false },
    { href: "/intake", label: "Intake", active: false },
    { href: "/revenue", label: "Revenue", active: false },
    { href: "/edi", label: "EDI", active: false },
    { href: "/fax", label: "Fax", active: false },
    ...(canManageUsers
      ? [
          { href: "/settings", label: "Settings", active: false },
          { href: "/admin/denials/queue", label: "Denials", active: false },
          { href: "/admin/integrations/availity", label: "Integrations", active: false },
          { href: "/admin/learning", label: "Learning", active: false },
          { href: "/admin/playbooks", label: "Playbooks", active: false },
        ]
      : []),
  ]

  return (
    <div className="min-h-screen text-white">
      {/* ── Top Bar ──────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[rgba(8,16,28,0.92)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[2200px] items-center gap-4 px-4 py-3">
          {/* Hamburger */}
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

          {/* Title */}
          <div className="mr-4 hidden sm:block">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">Poseidon</p>
            <p className="text-sm font-semibold text-white">Operations Deck</p>
          </div>

          {/* Search */}
          <label className="flex flex-1 max-w-xl items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition focus-within:border-cyan-300/40 focus-within:bg-white/8">
            <svg className="h-4 w-4 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
            <input
              id="poseidon-search"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patient, payer, HCPCS, order..."
              type="search"
              value={search}
            />
            <kbd className="hidden rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:block">⌘F</kbd>
          </label>

          {/* Business line tabs */}
          <div className="hidden items-center gap-1 lg:flex">
            {businessLineTabs.map((tab) => (
              <button
                key={tab.id}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  activeBusinessLine === tab.id
                    ? "bg-cyan-400/15 text-cyan-200 border border-cyan-400/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent",
                )}
                onClick={() => setActiveBusinessLine(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Summary chips */}
          <div className="hidden items-center gap-3 xl:flex">
            <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-300">
              {totalCards} cases
            </span>
            <span className="rounded-md bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-300">
              {formatCurrency(totalValue)}
            </span>
            {urgentCards > 0 && (
              <span className="rounded-md bg-red-400/15 px-2 py-1 font-mono text-[11px] text-red-300">
                {urgentCards} urgent
              </span>
            )}
            {blockedCards > 0 && (
              <span className="rounded-md bg-amber-400/15 px-2 py-1 font-mono text-[11px] text-amber-300">
                {blockedCards} blocked
              </span>
            )}
          </div>

          {/* Trident toggle */}
          <button
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-medium transition",
              tridentOpen
                ? "border-cyan-400/30 bg-cyan-400/15 text-cyan-200"
                : "border-white/10 bg-white/5 text-slate-300 hover:text-white hover:border-cyan-300/30",
            )}
            onClick={() => setTridentOpen((p) => !p)}
            type="button"
          >
            Trident AI
          </button>

          {/* User */}
          <div className="hidden items-center gap-2 md:flex">
            <div className="text-right">
              <p className="text-xs font-medium text-white">{userName}</p>
              <p className="font-mono text-[10px] text-slate-500">{String(userRole)}</p>
            </div>
          </div>
        </div>

        {/* Mobile business line tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-white/5 px-4 py-2 lg:hidden">
          {businessLineTabs.map((tab) => (
            <button
              key={tab.id}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition",
                activeBusinessLine === tab.id
                  ? "bg-cyan-400/15 text-cyan-200 border border-cyan-400/30"
                  : "text-slate-400 hover:text-white border border-transparent",
              )}
              onClick={() => setActiveBusinessLine(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Hamburger Menu Drawer ────────────────── */}
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
              {navItems.map((item, idx) => (
                <React.Fragment key={item.href}>
                  {idx > 0 && item.href.startsWith("/admin") && !navItems[idx - 1].href.startsWith("/admin") && (
                    <div className="my-2 border-t border-white/8" />
                  )}
                  {idx > 0 && item.href.startsWith("/admin") && !navItems[idx - 1].href.startsWith("/admin") && (
                    <p className="px-3 pt-1 pb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">Admin</p>
                  )}
                  <Link
                    className={cn(
                      "block rounded-lg px-3 py-2.5 text-sm transition",
                      item.active
                        ? "bg-cyan-400/10 text-cyan-200 font-medium"
                        : "text-slate-300 hover:bg-white/5 hover:text-white",
                    )}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                </React.Fragment>
              ))}
              <Link
                className="block rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                href={matiaUrl}
                onClick={() => setMenuOpen(false)}
              >
                Matia Dashboard
              </Link>
            </nav>

            <div className="mt-8 space-y-3">
              <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">System</p>
                <p className="mt-1 text-sm text-emerald-300">{initialSystemState.status}</p>
                <p className="mt-1 text-xs text-slate-400">Services: {initialSystemState.services.join(", ")}</p>
              </div>
              <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Session</p>
                <p className="mt-1 text-sm text-white">{userName}</p>
                <p className="mt-1 text-xs text-slate-400">Role: {String(userRole)}</p>
              </div>

              <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Pipeline</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  {PIPELINE_ORDER.map((key) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-slate-400">{COLUMN_LABELS[key]}</span>
                      <span className="text-white">{filteredColumns[key]?.cards.length || 0}</span>
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

      {/* ── KPI Strip ────────────────────────────── */}
      <div className="border-b border-white/5 bg-[rgba(8,16,28,0.6)]">
        <div className="mx-auto flex max-w-[2200px] items-center gap-6 overflow-x-auto px-4 py-2.5">
          <KpiChip label="Clean Claim" value={`${initialKPIs.cleanClaimRate.value}%`} sub={initialKPIs.cleanClaimRate.delta} color="text-emerald-300" />
          <KpiChip label="Days in AR" value={`${initialKPIs.daysInAR.value}`} sub={initialKPIs.daysInAR.delta} color="text-blue-300" />
          <KpiChip label="Appeal Win" value={`${initialKPIs.appealWinRate.value}%`} sub={initialKPIs.appealWinRate.delta} color="text-amber-300" />
          <KpiChip label="Orders" value={`${initialKPIs.outstandingOrders.value}`} sub={`${initialKPIs.outstandingOrders.urgent} urgent`} color="text-red-300" />
        </div>
      </div>

      {/* ── Main Pipeline Grid ───────────────────── */}
      <div className="mx-auto max-w-[2200px] px-4 py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {PIPELINE_ORDER.map((columnId) => {
            const col = filteredColumns[columnId]
            const cards = col?.cards || []
            const colValue = sumCardValues(cards)

            return (
              <section
                key={columnId}
                className={cn(
                  "min-h-[200px] rounded-xl border bg-[rgba(255,255,255,0.025)] transition",
                  COLUMN_COLORS[columnId],
                  dragOverColumn === columnId && "bg-cyan-400/5 border-cyan-400/40",
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOverColumn(columnId) }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => { e.preventDefault(); handleDrop(columnId) }}
              >
                {/* Column header */}
                <div className="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", COLUMN_DOT[columnId])} />
                    <span className="text-xs font-semibold text-white">{COLUMN_LABELS[columnId]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-400">{cards.length}</span>
                    {colValue > 0 && (
                      <span className="font-mono text-[10px] text-slate-500">{formatCurrency(colValue)}</span>
                    )}
                  </div>
                </div>

                {/* Cards */}
                <div className="space-y-2 p-2">
                  {cards.map((card) => (
                    <PatientCard
                      key={card.id}
                      card={card}
                      columnId={columnId}
                      expanded={expandedCard === card.id}
                      onToggle={() => setExpandedCard(expandedCard === card.id ? null : card.id)}
                      onDragStart={() => setDragging({ cardId: card.id, columnId })}
                      onDragEnd={() => setDragging(null)}
                    />
                  ))}
                  {cards.length === 0 && (
                    <div className="py-8 text-center text-xs text-slate-600">
                      No cases
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      <div className="mx-auto max-w-[2200px] border-t border-white/5 px-4 py-6">
        <h2 className="mb-3 text-sm font-semibold text-white">Communications</h2>
        <div className="rounded-lg border border-white/8 bg-[rgba(255,255,255,0.025)] p-4">
          <CommunicationsPanel
            initialItems={initialCommunications as ComponentProps<typeof CommunicationsPanel>["initialItems"]}
            integrations={initialIntegrations as ComponentProps<typeof CommunicationsPanel>["integrations"]}
          />
        </div>
      </div>

      {/* ── Trident AI Bar ───────────────────────── */}
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
                    className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-50"
                    disabled={queryLoading}
                    type="submit"
                  >
                    {queryLoading ? "Running..." : "Ask"}
                  </button>
                </form>
                <div className="mt-2 flex gap-2">
                  {["Which queue needs attention first?", "Highest reimbursement risk?", "Blocked by documentation?"].map((q) => (
                    <button
                      key={q}
                      className="rounded border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] text-slate-400 transition hover:text-white"
                      onClick={() => setPrompt(q)}
                      type="button"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-px self-stretch bg-white/10" />
              <div className="max-h-24 min-w-[300px] max-w-md overflow-y-auto text-sm leading-6 text-slate-300">
                {tridentResponse}
              </div>
              <button
                className="flex-shrink-0 rounded-lg border border-white/10 px-2 py-2 text-xs text-slate-400 transition hover:text-white"
                onClick={() => setTridentOpen(false)}
                type="button"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── KPI Chip ───────────────────────────────────────── */

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

/* ── Patient Card ────────────────────────────────────── */

function PatientCard({
  card,
  columnId,
  expanded,
  onToggle,
  onDragStart,
  onDragEnd,
}: {
  card: KanbanCard
  columnId: string
  expanded: boolean
  onToggle: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const orderId = card.orderIds?.[0] || card.id

  return (
    <>
      {/* ── Compact card in column ── */}
      <div
        className={cn(
          "rounded-lg border bg-[rgba(255,255,255,0.035)] cursor-pointer select-none transition hover:border-cyan-300/20",
          card.locked ? "border-amber-400/25" : "border-white/8",
        )}
        draggable
        onClick={onToggle}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart() }}
        onDragEnd={onDragEnd}
      >
        <div className="px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-white leading-tight">{card.title}</p>
            <span className={cn("flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase", PRIORITY_STYLES[card.priority])}>
              {card.priority === "high" ? "URG" : card.priority === "med" ? "MED" : "LOW"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400 leading-tight">{card.payer}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">{card.value}</span>
            <div className="flex items-center gap-2">
              {(card.href || card.patientId) && (
                <Link
                  href={card.href || `/patients/${card.patientId}`}
                  className="rounded-full border border-cyan-400/25 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-cyan-300 hover:border-cyan-400 hover:text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  Chart
                </Link>
              )}
              <span className="text-[10px] text-slate-500">{formatDateLabel(card.due)}</span>
            </div>
          </div>
          {card.locked && (
            <div className="mt-2 flex items-center gap-1.5 rounded bg-amber-400/10 px-2 py-1 text-[10px] text-amber-300">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              Blocked
            </div>
          )}
        </div>
      </div>

      {/* ── Chart modal overlay ── */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" onClick={onToggle}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg rounded-2xl border border-cyan-400/20 bg-[linear-gradient(160deg,#0a1525,#0d1c30)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-cyan-300">Patient Chart</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{card.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{card.payer} · {card.type}</p>
              </div>
              <button
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400 transition hover:text-white"
                onClick={onToggle}
                type="button"
              >
                ✕ Close
              </button>
            </div>

            {/* Details grid */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <DetailCell label="Value" value={card.value} highlight />
              <DetailCell label="Priority" value={card.priority === "high" ? "Urgent" : card.priority === "med" ? "Medium" : "Low"} />
              <DetailCell label="Assignee" value={card.assignee} />
              <DetailCell label="Orders" value={String(card.orderCount || card.orderIds?.length || 1)} />
              <DetailCell label="Due" value={formatDateLabel(card.due)} />
              <DetailCell label="Status" value={columnId.replace(/([A-Z])/g, " $1").trim()} />
            </div>

            {card.locked && card.lockReason && (
              <div className="mt-4 rounded-lg bg-amber-400/10 border border-amber-400/20 px-4 py-3 text-sm text-amber-200">
                {card.lockReason}
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex gap-3">
              {(card.href || card.patientId) ? (
                <Link
                  className="flex-1 rounded-lg border border-cyan-400/30 bg-cyan-400/10 py-3 text-center text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
                  href={card.href || `/patients/${card.patientId}`}
                >
                  Open Full Record
                </Link>
              ) : (
                <span className="flex-1 rounded-lg border border-white/10 bg-white/5 py-3 text-center text-sm text-slate-500 cursor-not-allowed">
                  No patient linked
                </span>
              )}
              <button
                className="rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-300 transition hover:text-white"
                onClick={onToggle}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ── Detail Cell ────────────────────────────────────── */

function DetailCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={cn("mt-1 text-sm", highlight ? "font-semibold text-white" : "text-slate-200")}>{value}</p>
    </div>
  )
}

/* ── Doc Row ─────────────────────────────────────────── */

function DocRow({ label, href }: { label: string; href: string }) {
  return (
    <a
      className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.02] px-4 py-3 text-sm text-slate-300 transition hover:border-cyan-300/25 hover:bg-white/[0.04] hover:text-cyan-200"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      <span>{label}</span>
      <svg className="h-4 w-4 flex-shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    </a>
  )
}
