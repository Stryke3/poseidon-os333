"use client"

import Link from "next/link"
import { useState } from "react"
import { signOut, useSession } from "next-auth/react"

import {
  HeroPanel,
  MetricCard,
  PageShell,
  SectionCard,
  SectionHeading,
} from "@/components/dashboard/DashboardPrimitives"
import CommunicationsPanel from "@/components/dashboard/CommunicationsPanel"
import NeuralOsDashboard from "@/components/dashboard/NeuralOsDashboard"
import KanbanBoard from "@/components/kanban/KanbanBoard"
import LiveIngestDropzone from "@/components/ingest/LiveIngestDropzone"
import { queryTrident } from "@/lib/api"
import type { AccountRecord, KanbanCard, KanbanColumn } from "@/lib/data"

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

const pipelineOrder = [
  "pendingAuth",
  "authorized",
  "submitted",
  "denied",
  "appealed",
  "paid",
] as const

const pipelineAccents: Record<string, string> = {
  pendingAuth: "border-accent-gold/50 bg-accent-gold/10 text-accent-gold-2",
  authorized: "border-accent-blue/50 bg-accent-blue/10 text-accent-blue",
  submitted: "border-accent-teal/50 bg-accent-teal/10 text-accent-teal",
  denied: "border-accent-red/50 bg-accent-red/10 text-accent-red",
  appealed: "border-accent-purple/50 bg-accent-purple/10 text-accent-purple",
  paid: "border-accent-green/50 bg-accent-green/10 text-accent-green",
}

const statusAccents: Record<AccountRecord["status"], string> = {
  active: "bg-accent-green/10 text-accent-green",
  pending: "bg-accent-gold/10 text-accent-gold-2",
  appeal: "bg-accent-purple/10 text-accent-purple",
  denied: "bg-accent-red/10 text-accent-red",
}

const signatureThemes: Record<
  NonNullable<DashboardShellProps["variant"]>,
  {
    border: string
    background: string
    label: string
    glow: string
    heroEyebrow: string
    searchField: string
    activeButton: string
    inactiveButton: string
  }
> = {
  os: {
    border: "border-[rgba(118,243,255,0.16)]",
    background: "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(7,14,26,0.18))]",
    label: "text-[#8ec5ff]",
    glow: "drop-shadow-[0_0_18px_rgba(118,243,255,0.12)]",
    heroEyebrow: "border-[rgba(118,243,255,0.35)] bg-[rgba(118,243,255,0.08)] text-[#a8dcff]",
    searchField: "border-[rgba(118,243,255,0.16)] focus:border-[#76f3ff] focus:shadow-[0_0_0_1px_rgba(118,243,255,0.24),0_0_24px_rgba(118,243,255,0.1)]",
    activeButton: "border-[#76f3ff] bg-[linear-gradient(180deg,rgba(118,243,255,0.18),rgba(26,110,245,0.18))] text-white shadow-[0_12px_32px_rgba(10,30,58,0.22)]",
    inactiveButton: "border-white/10 bg-white/5 text-slate-200 hover:border-[#76f3ff]/50",
  },
  executive: {
    border: "border-[rgba(26,110,245,0.22)]",
    background: "bg-[linear-gradient(180deg,rgba(26,110,245,0.12),rgba(7,14,26,0.18))]",
    label: "text-accent-blue",
    glow: "drop-shadow-[0_0_18px_rgba(26,110,245,0.18)]",
    heroEyebrow: "border-accent-blue/40 bg-accent-blue/10 text-accent-blue",
    searchField: "border-accent-blue/20 focus:border-accent-blue focus:shadow-[0_0_0_1px_rgba(26,110,245,0.25),0_0_24px_rgba(26,110,245,0.12)]",
    activeButton: "border-accent-blue bg-accent-blue text-white shadow-[0_12px_32px_rgba(26,110,245,0.18)]",
    inactiveButton: "border-white/10 bg-white/5 text-slate-200 hover:border-accent-blue",
  },
  ceo: {
    border: "border-[rgba(240,180,50,0.22)]",
    background: "bg-[linear-gradient(180deg,rgba(240,180,50,0.12),rgba(7,14,26,0.18))]",
    label: "text-accent-gold-2",
    glow: "drop-shadow-[0_0_18px_rgba(240,180,50,0.18)]",
    heroEyebrow: "border-accent-gold-2/40 bg-accent-gold-2/10 text-accent-gold-2",
    searchField: "border-accent-gold-2/20 focus:border-accent-gold-2 focus:shadow-[0_0_0_1px_rgba(240,180,50,0.22),0_0_24px_rgba(240,180,50,0.12)]",
    activeButton: "border-accent-gold-2 bg-accent-gold-2 text-navy shadow-[0_12px_32px_rgba(240,180,50,0.18)]",
    inactiveButton: "border-white/10 bg-white/5 text-slate-200 hover:border-accent-gold-2",
  },
  intake: {
    border: "border-[rgba(15,168,106,0.22)]",
    background: "bg-[linear-gradient(180deg,rgba(15,168,106,0.12),rgba(7,14,26,0.18))]",
    label: "text-accent-green",
    glow: "drop-shadow-[0_0_18px_rgba(15,168,106,0.18)]",
    heroEyebrow: "border-accent-green/40 bg-accent-green/10 text-accent-green",
    searchField: "border-accent-green/20 focus:border-accent-green focus:shadow-[0_0_0_1px_rgba(15,168,106,0.22),0_0_24px_rgba(15,168,106,0.12)]",
    activeButton: "border-accent-green bg-accent-green text-white shadow-[0_12px_32px_rgba(15,168,106,0.18)]",
    inactiveButton: "border-white/10 bg-white/5 text-slate-200 hover:border-accent-green",
  },
}

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
  const { data: session } = useSession()
  const [accounts, setAccounts] = useState(initialAccounts)
  const [kanbanColumns, setKanbanColumns] = useState(initialKanban)
  const [patientSearch, setPatientSearch] = useState("")
  const [prompt, setPrompt] = useState("")
  const [tridentResponse, setTridentResponse] = useState(
    "Run a queue, denial, or reimbursement check.",
  )
  const [queryLoading, setQueryLoading] = useState(false)
  const displayIdentity =
    session?.user?.name || session?.user?.email || "secured user"
  const displayRole = session?.user?.role || "protected"
  const canManageUsers =
    session?.user?.role === "admin" || (session?.user?.permissions || []).includes("manage_users")
  const navItems = [
    { href: "/", label: "Live OS", sublabel: "Main board", active: variant === "os" },
    { href: "/executive", label: "Executive Dashboard", sublabel: "Revenue view", active: variant === "executive" },
    { href: "/ceo", label: "CEO Dashboard", sublabel: "Leadership view", active: variant === "ceo" },
    { href: "/intake", label: "Patient Intake", sublabel: "Intake queue", active: variant === "intake" },
    ...(canManageUsers
      ? [{ href: "/settings", label: "Settings Admin", sublabel: "System controls", active: false }]
      : []),
  ]
  const signatureTheme = signatureThemes[variant]

  if (variant === "os") {
    return (
      <NeuralOsDashboard
        initialAccounts={initialAccounts}
        initialCommunications={initialCommunications}
        initialIntegrations={initialIntegrations}
        initialKanban={initialKanban}
        initialKPIs={initialKPIs}
        initialPipeline={initialPipeline}
        initialSystemState={initialSystemState}
      />
    )
  }

  const normalizedSearch = patientSearch.trim().toLowerCase()
  const filteredAccounts = normalizedSearch
    ? accounts.filter((account) =>
        [account.name, account.payer, account.id, account.type]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedSearch)),
      )
    : accounts

  const filteredKanbanColumns = normalizedSearch
    ? Object.fromEntries(
        Object.entries(kanbanColumns).map(([key, column]) => [
          key,
          {
            ...column,
            cards: column.cards.filter((card) =>
              [
                card.title,
                card.payer,
                card.id,
                card.type,
                card.href,
                ...(card.orderIds || []),
              ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
            ),
          },
        ]),
      )
    : kanbanColumns

  const kpiCards = [
    {
      label: "Clean Claim Rate",
      value: `${initialKPIs.cleanClaimRate.value}%`,
      supportingText: initialKPIs.cleanClaimRate.delta,
      tone: "text-accent-green",
    },
    {
      label: "Days in AR",
      value: `${initialKPIs.daysInAR.value}`,
      supportingText: initialKPIs.daysInAR.delta,
      tone: "text-accent-blue",
    },
    {
      label: "Appeal Win Rate",
      value: `${initialKPIs.appealWinRate.value}%`,
      supportingText: initialKPIs.appealWinRate.delta,
      tone: "text-accent-gold-2",
    },
    {
      label: "Outstanding Orders",
      value: `${initialKPIs.outstandingOrders.value}`,
      supportingText: `${initialKPIs.outstandingOrders.urgent} urgent`,
      tone: "text-accent-red",
    },
  ]

  const systemCards = [
    {
      eyebrow: "System State",
      title: initialSystemState.status,
      details: [
        `Services: ${initialSystemState.services.join(", ")}`,
        `Ports: ${initialSystemState.ports}`,
      ],
      className: "border-accent-green/30 bg-accent-green/10",
      eyebrowClassName: "text-accent-green",
    },
    {
      eyebrow: "Operators",
      title: initialSystemState.operators.join(", "),
      details: [`Signed in as ${displayIdentity}`, `Role: ${displayRole}`],
      className: "border-white/10 bg-navy-3/80",
      eyebrowClassName: "text-slate-400",
    },
    {
      eyebrow: "Session",
      title: "Last Sync",
      details: [new Date(initialSystemState.lastSync).toLocaleString()],
      className: "border-white/10 bg-navy-3/80",
      eyebrowClassName: "text-slate-400",
    },
  ]

  async function handleTridentSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!prompt.trim()) return

    setQueryLoading(true)
    try {
      const result = await queryTrident(prompt, {
        accounts: accounts.slice(0, 8).map((account) => ({
          name: account.name,
          payer: account.payer,
          type: account.type,
          value: account.value,
        })),
        pipeline: Object.fromEntries(
          Object.entries(kanbanColumns).map(([key, column]) => [key, column.cards.length]),
        ),
      })
      setTridentResponse(result.response || "Trident returned no response.")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to reach Trident."
      setTridentResponse(message)
    } finally {
      setQueryLoading(false)
    }
  }

  function handleLiveIngest(payload: {
    patients: AccountRecord[]
    cards: KanbanCard[]
  }) {
    if (payload.patients.length) {
      setAccounts((prev) => {
        const merged = new Map<string, AccountRecord>()
        for (const account of [...payload.patients, ...prev]) {
          merged.set(account.id, account)
        }
        return Array.from(merged.values())
      })
    }

    if (payload.cards.length) {
      setKanbanColumns((prev) => ({
        ...prev,
        pendingAuth: {
          ...prev.pendingAuth,
          cards: Array.from(
            new Map(
              [...payload.cards, ...prev.pendingAuth.cards].map((card) => [card.id, card]),
            ).values(),
          ),
        },
      }))
    }
  }

  return (
    <PageShell>
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="glass-panel-strong hud-outline rounded-[32px] p-4 sm:p-5">
          <div className="rounded-[24px] border border-[rgba(142,197,255,0.18)] bg-[linear-gradient(180deg,rgba(119,188,255,0.16),rgba(17,35,68,0.22))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
            <p className="text-[10px] uppercase tracking-[0.3em] text-accent-blue">Poseidon OS</p>
            <p className="mt-2 font-display text-3xl uppercase tracking-[0.12em] text-white">Flight Deck</p>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              Main operating shell
            </p>
          </div>

          <div className={`mt-4 rounded-[24px] border px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ${signatureTheme.border} ${signatureTheme.background}`}>
            <p className={`text-[10px] uppercase tracking-[0.34em] ${signatureTheme.label}`}>
              Trident Signature
            </p>
            <p className={`mt-2 font-display text-2xl uppercase leading-[0.92] tracking-[0.12em] text-white ${signatureTheme.glow}`}>
              Clinical.
              <br />
              Revenue.
              <br />
              Control.
            </p>
          </div>

          <nav className="mt-4 grid gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                className={`rounded-[22px] border px-4 py-3 transition ${
                  item.active
                    ? "border-[rgba(118,243,255,0.28)] bg-[linear-gradient(180deg,rgba(118,243,255,0.12),rgba(26,110,245,0.08))] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_32px_rgba(5,12,25,0.24)]"
                    : "border-white/10 bg-white/[0.045] hover:border-accent-blue/30 hover:bg-white/[0.08]"
                }`}
                href={item.href}
              >
                <p className={`text-sm font-semibold ${item.active ? "text-white" : "text-slate-200"}`}>{item.label}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">{item.sublabel}</p>
              </Link>
            ))}
          </nav>

          <div className="mt-4 grid gap-3 text-xs text-slate-300">
            {systemCards.map((card, index) => (
              <div
                key={card.eyebrow}
                className={`rounded-[24px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${card.className}`}
              >
                <p className={`text-[10px] uppercase tracking-[0.3em] ${card.eyebrowClassName}`}>
                  {card.eyebrow}
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {card.title}
                </p>
                {card.details.map((detail) => (
                  <p key={detail} className="mt-1 text-slate-300">
                    {detail}
                  </p>
                ))}
                {index === 2 && (
                  <button
                    className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:border-accent-blue hover:text-white"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    type="button"
                  >
                    Sign out
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>

        <div>
          <HeroPanel
            eyebrowClassName={signatureTheme.heroEyebrow}
            eyebrow={
              variant === "executive"
                ? "Poseidon OS Executive Command"
                : variant === "ceo"
                  ? "Poseidon OS CEO Command"
                  : variant === "intake"
                    ? "Poseidon OS Intake Workspace"
                    : "Poseidon OS Morning Command"
            }
            title={variant === "ceo" ? "Enterprise command." : variant === "executive" ? "Revenue command." : variant === "intake" ? "Patient intake." : "Live operating system."}
            description={
              variant === "executive"
                ? "Executive KPIs, payment activity, and patient movement."
                : variant === "ceo"
                  ? "Organization status, queue pressure, and reimbursement exposure."
                  : variant === "intake"
                    ? "Intake status, patient movement, and worklist execution."
                    : "Queue status, pressure points, and patient movement."
            }
            actions={
              <>
                <Link
                  className={`rounded-2xl border px-4 py-3 text-sm transition ${signatureTheme.inactiveButton}`}
                  href="/"
                >
                  Live OS
                </Link>
                <Link
                  className={`rounded-2xl border px-4 py-3 text-sm transition ${
                    variant === "executive"
                      ? signatureTheme.activeButton
                      : signatureTheme.inactiveButton
                  }`}
                  href="/executive"
                >
                  Executive Dashboard
                </Link>
                <Link
                  className={`rounded-2xl border px-4 py-3 text-sm transition ${
                    variant === "ceo"
                      ? signatureTheme.activeButton
                      : signatureTheme.inactiveButton
                  }`}
                  href="/ceo"
                >
                  CEO Dashboard
                </Link>
                <Link
                  className={`rounded-2xl border px-4 py-3 text-sm transition ${
                    variant === "intake"
                      ? signatureTheme.activeButton
                      : signatureTheme.inactiveButton
                  }`}
                  href="/intake"
                >
                  Patient Intake
                </Link>
              </>
            }
            className="mb-8"
          />

          <SectionCard className="mb-8">
            <SectionHeading
              eyebrow="Patient Search"
              title="Find Any Patient Fast"
              description="Search by patient name, payer, patient ID, order ID, or card title."
            />
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <input
                className={`w-full rounded-[22px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(10,16,28,0.18))] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 ${signatureTheme.searchField}`}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="Search Rosa Alvarez, Aetna, order ID, or chart card..."
                type="search"
                value={patientSearch}
              />
              <div className="rounded-[22px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-slate-300">
                {normalizedSearch
                  ? `${filteredAccounts.length} patient ${filteredAccounts.length === 1 ? "match" : "matches"}`
                  : `${accounts.length} patients indexed`}
              </div>
            </div>
          </SectionCard>

          <div className="mb-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4"
          >
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
              {kpi.label}
            </p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="font-display text-4xl text-white">{kpi.value}</p>
              <p className={`text-sm font-semibold ${kpi.tone}`}>{kpi.supportingText}</p>
            </div>
          </div>
        ))}
          </div>

          <section className="grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.95fr)]">
        <div className="space-y-6">
          {variant === "intake" && <LiveIngestDropzone onIngested={handleLiveIngest} />}

          <SectionCard className="backdrop-blur">
            <SectionHeading
              eyebrow="Worklist Lanes"
              title="Operational Queue"
              description={
                variant === "executive"
                  ? "Cross-stage visibility including paid movement"
                  : "Pipeline totals and intake status"
              }
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              {pipelineOrder.map((key) => (
                <MetricCard
                  key={key}
                  className={pipelineAccents[key]}
                  label={
                    key === "pendingAuth"
                      ? "Pending Auth"
                      : key.charAt(0).toUpperCase() + key.slice(1)
                  }
                  value={`${initialPipeline[key].count}`}
                  supportingText={initialPipeline[key].value}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard className="bg-navy-2/80">
            <SectionHeading
              eyebrow="Kanban Worklist"
              title="Drag And Drop Queue"
              description="Live worklist rendered from production orders"
            />

            <KanbanBoard initialColumns={filteredKanbanColumns} />
          </SectionCard>
        </div>

        <aside className="space-y-6">
          <SectionCard className="bg-[linear-gradient(180deg,rgba(12,20,36,0.95),rgba(7,12,24,0.95))]">
            <SectionHeading
              eyebrow="Patients"
              title={
                variant === "executive"
                  ? "Executive Patient Snapshot"
                  : "Consolidated Patient Cards"
              }
              description="Patients with the highest current workflow relevance."
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
              {filteredAccounts.map((account) => (
                <Link
                  key={account.id}
                  href={account.href || "/intake"}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-accent-blue/40 hover:bg-white/[0.07]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {account.name}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {account.id} · {account.payer} · {account.type}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${statusAccents[account.status]}`}
                    >
                      {account.status}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-accent-gold-2">
                    {account.value}
                  </p>
                </Link>
              ))}
              {!filteredAccounts.length ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-500">
                  No patients matched that search yet.
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard>
            <SectionHeading
              eyebrow="Communications"
              title="Team Feed"
              description="Integration status and in-app order updates."
            />
            <CommunicationsPanel
              initialItems={initialCommunications}
              integrations={initialIntegrations}
            />
          </SectionCard>

          <SectionCard>
            <SectionHeading
              eyebrow="Trident Intelligence"
              title="Query Engine"
              description="Checks against the live queue."
            />

            <form className="mt-5 space-y-3" onSubmit={handleTridentSubmit}>
              <textarea
                className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-black/10 p-4 text-sm text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-accent-blue"
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Which queue needs attention first?"
                value={prompt}
              />
              <button
                className="w-full rounded-2xl bg-accent-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1459c9] disabled:cursor-not-allowed disabled:bg-[#0f3a7a]"
                disabled={queryLoading}
                type="submit"
              >
                {queryLoading ? "Running check..." : "Run Trident"}
              </button>
            </form>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4 text-sm leading-6 text-slate-300">
              {tridentResponse}
            </div>
          </SectionCard>
        </aside>
          </section>
        </div>
      </div>
    </PageShell>
  )
}
