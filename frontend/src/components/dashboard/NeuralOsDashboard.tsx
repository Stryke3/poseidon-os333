"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { signOut, useSession } from "next-auth/react"

import { queryTrident } from "@/lib/api"
import type { AccountRecord, KanbanCard, KanbanColumn } from "@/lib/data"

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

type WorkflowLane = {
  id: string
  title: string
  eyebrow: string
  tone: "alert" | "scan" | "resolve"
  sourceIds: string[]
  cards: KanbanCard[]
}

type ModalDocument = {
  type: string
  card: KanbanCard | null
}

type BusinessLineId = "all" | "dme" | "implants" | "biologics" | "matia"

const laneBlueprints: Array<Omit<WorkflowLane, "cards">> = [
  {
    id: "intake",
    title: "Intake",
    eyebrow: "authorization",
    tone: "alert",
    sourceIds: ["pendingAuth", "authorized"],
  },
  {
    id: "review",
    title: "Clinical Review",
    eyebrow: "documentation",
    tone: "scan",
    sourceIds: ["submitted", "denied", "appealed"],
  },
  {
    id: "complete",
    title: "Completed",
    eyebrow: "closed",
    tone: "resolve",
    sourceIds: ["paid"],
  },
]

const toneClasses = {
  alert: {
    pill: "border-[#d8b46a]/35 bg-[linear-gradient(180deg,rgba(216,180,106,0.14),rgba(216,180,106,0.05))] text-[#f8e7bb]",
    dot: "bg-[#d8b46a] text-[#f8e7bb]",
    glow: "shadow-[0_0_35px_rgba(216,180,106,0.12)]",
    progress: "from-[#d8b46a] via-[#e6d09a] to-[#f4e7c5]",
  },
  scan: {
    pill: "border-cyan-200/30 bg-[linear-gradient(180deg,rgba(186,230,253,0.14),rgba(186,230,253,0.05))] text-cyan-50",
    dot: "bg-cyan-200 text-cyan-100",
    glow: "shadow-[0_0_35px_rgba(186,230,253,0.12)]",
    progress: "from-cyan-100 via-sky-200 to-blue-300",
  },
  resolve: {
    pill: "border-emerald-200/30 bg-[linear-gradient(180deg,rgba(187,247,208,0.14),rgba(187,247,208,0.05))] text-emerald-50",
    dot: "bg-emerald-200 text-emerald-100",
    glow: "shadow-[0_0_35px_rgba(187,247,208,0.1)]",
    progress: "from-emerald-100 via-teal-200 to-cyan-200",
  },
} as const

const priorityClasses = {
  high: "border-[#d8b46a]/40 bg-[#d8b46a]/10 text-[#f8e7bb]",
  med: "border-cyan-200/30 bg-cyan-200/10 text-cyan-50",
  low: "border-emerald-200/30 bg-emerald-200/10 text-emerald-50",
} as const

const businessLineTabs: Array<{
  id: BusinessLineId
  label: string
  eyebrow: string
}> = [
  { id: "all", label: "All", eyebrow: "Enterprise" },
  { id: "dme", label: "DME", eyebrow: "Core durable" },
  { id: "implants", label: "Implants", eyebrow: "Surgical" },
  { id: "biologics", label: "Biologics", eyebrow: "Regenerative" },
  { id: "matia", label: "Matia", eyebrow: "Mobility" },
]

function cn(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ")
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function deriveLoad(kpis: DashboardKpis) {
  return Math.max(
    72,
    Math.min(
      97,
      Math.round(
        (kpis.cleanClaimRate.value + kpis.appealWinRate.value + (100 - kpis.daysInAR.value)) / 3,
      ),
    ),
  )
}

function cardMatches(card: KanbanCard, query: string) {
  if (!query) return true
  return [
    card.title,
    card.value,
    card.payer,
    card.type,
    card.id,
    card.patientId,
    card.assignee,
    ...(card.orderIds || []),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query))
}

function buildWorkflowLanes(columns: Record<string, KanbanColumn>) {
  return laneBlueprints.map((lane) => ({
    ...lane,
    cards: lane.sourceIds.flatMap((sourceId) => columns[sourceId]?.cards || []),
  }))
}

function getProgressByLane(laneId: string) {
  if (laneId === "complete") return 100
  if (laneId === "review") return 68
  return 34
}

function getStatusCopy(card: KanbanCard) {
  if (card.priority === "high") return "Needs attention before the next handoff."
  if (card.priority === "med") return "Ready for review with normal follow-up."
  return "Stable and ready to move forward."
}

function formatBusinessLineLabel(value: BusinessLineId) {
  if (value === "all") return "Enterprise"
  if (value === "dme") return "DME"
  if (value === "implants") return "Implants"
  if (value === "biologics") return "Biologics"
  return "Matia"
}

function cardMatchesBusinessLine(card: KanbanCard, businessLine: BusinessLineId) {
  if (businessLine === "all") return true
  return card.businessLine === businessLine
}

function accountMatchesBusinessLine(account: AccountRecord, businessLine: BusinessLineId) {
  if (businessLine === "all") return true
  return account.businessLine === businessLine
}

function sumCardValues(cards: KanbanCard[]) {
  return cards.reduce((sum, card) => {
    const numeric = Number.parseFloat(card.value.replace(/[$,]/g, ""))
    return sum + (Number.isFinite(numeric) ? numeric : 0)
  }, 0)
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
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function buildAttentionFlags(card: KanbanCard, laneId: string) {
  const flags: string[] = []
  if (laneId === "intake") flags.push("Order needs placement")
  if (card.locked) flags.push("Insurance verification")
  if (laneId === "review") flags.push("Appeal or denial review")
  if (card.priority === "high") flags.push("Auth escalation")
  return Array.from(new Set(flags)).slice(0, 3)
}

export default function NeuralOsDashboard({
  initialKPIs,
  initialPipeline,
  initialAccounts,
  initialSystemState,
  initialKanban,
}: {
  initialKPIs: DashboardKpis
  initialPipeline: Record<string, { count: number; value: string }>
  initialAccounts: AccountRecord[]
  initialSystemState: SystemState
  initialCommunications?: Array<Record<string, unknown>>
  initialIntegrations?: Record<string, unknown>
  initialKanban: Record<string, KanbanColumn>
}) {
  const { data: session } = useSession()
  const [search, setSearch] = useState("")
  const [focusMode, setFocusMode] = useState(false)
  const [workflow, setWorkflow] = useState(() => buildWorkflowLanes(initialKanban))
  const [dragging, setDragging] = useState<{ cardId: string; laneId: string } | null>(null)
  const [dragOverLane, setDragOverLane] = useState<string | null>(null)
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({})
  const [activeDocument, setActiveDocument] = useState<ModalDocument | null>(null)
  const [activeBusinessLine, setActiveBusinessLine] = useState<BusinessLineId>("all")
  const [systemLoad, setSystemLoad] = useState(() => deriveLoad(initialKPIs))
  const [prompt, setPrompt] = useState("")
  const [tridentResponse, setTridentResponse] = useState(
    "Run a payer, documentation, or queue check.",
  )
  const [queryLoading, setQueryLoading] = useState(false)
  const [opsMessage, setOpsMessage] = useState<string | null>(null)
  const [opsLoadingKey, setOpsLoadingKey] = useState<string | null>(null)

  useEffect(() => {
    setWorkflow(buildWorkflowLanes(initialKanban))
  }, [initialKanban])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault()
        document.getElementById("poseidon-global-search")?.focus()
      }
      if (event.key === "Escape") {
        setActiveDocument(null)
      }
    }

    window.addEventListener("keydown", handleKeydown)
    return () => window.removeEventListener("keydown", handleKeydown)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSystemLoad((current) => {
        const drift = Math.round((Math.random() - 0.5) * 10)
        return Math.min(99, Math.max(70, current + drift))
      })
    }, 4800)

    return () => window.clearInterval(interval)
  }, [])

  const normalizedSearch = search.trim().toLowerCase()
  const scopedAccounts = useMemo(
    () => initialAccounts.filter((account) => accountMatchesBusinessLine(account, activeBusinessLine)),
    [activeBusinessLine, initialAccounts],
  )

  const filteredAccounts = useMemo(() => {
    if (!normalizedSearch) return scopedAccounts
    return scopedAccounts.filter((account) =>
      [account.name, account.payer, account.id, account.type, account.value]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedSearch)),
    )
  }, [normalizedSearch, scopedAccounts])

  const scopedWorkflow = useMemo(
    () =>
      workflow.map((lane) => ({
        ...lane,
        cards: lane.cards.filter((card) => cardMatchesBusinessLine(card, activeBusinessLine)),
      })),
    [activeBusinessLine, workflow],
  )

  const visibleWorkflow = useMemo(
    () =>
      scopedWorkflow.map((lane) => ({
        ...lane,
        cards: lane.cards.filter((card) => cardMatches(card, normalizedSearch)),
      })),
    [normalizedSearch, scopedWorkflow],
  )

  const totalPipeline = scopedWorkflow.reduce((sum, lane) => sum + lane.cards.length, 0)
  const totalOpenCards = scopedWorkflow.reduce((sum, lane) => sum + lane.cards.length, 0)
  const intakeCount = scopedWorkflow.find((lane) => lane.id === "intake")?.cards.length || 0
  const reviewCount = scopedWorkflow.find((lane) => lane.id === "review")?.cards.length || 0
  const completeCount = scopedWorkflow.find((lane) => lane.id === "complete")?.cards.length || 0
  const completionRatio = totalOpenCards ? Math.round((completeCount / totalOpenCards) * 100) : 0
  const topPatients = filteredAccounts
  const urgentCards = scopedWorkflow.flatMap((lane) => lane.cards).filter((card) => card.priority === "high").length
  const scopedRevenue = sumCardValues(scopedWorkflow.flatMap((lane) => lane.cards))
  const scopedPaidValue = sumCardValues(scopedWorkflow.find((lane) => lane.id === "complete")?.cards || [])
  const userName = session?.user?.name || session?.user?.email || "Active Session"
  const userRole = session?.user?.role || "admin"
  const ringOffset = 176 - (systemLoad / 100) * 176
  const activeLaneId = focusMode ? "review" : null

  const commandStats = [
    {
      label: `${formatBusinessLineLabel(activeBusinessLine)} Queue`,
      value: `${totalPipeline}`,
      detail: `${urgentCards} priority cases in scope`,
    },
    {
      label: "Active Cases",
      value: `${intakeCount + reviewCount}`,
      detail: "active records across intake and review",
    },
    {
      label: "Open Value",
      value: formatCurrency(scopedRevenue),
      detail: `${completeCount} resolved cases in the selected line`,
    },
    {
      label: "Paid Value",
      value: formatCurrency(scopedPaidValue),
      detail: `${completionRatio}% of scoped work is in realization`,
    },
  ]

  const missionControlMetrics = [
    { label: "Auth Queue", value: intakeCount, tone: "text-[#f8e7bb]" },
    { label: "Clinical Review", value: reviewCount, tone: "text-cyan-50" },
    { label: "Realized Revenue", value: completeCount, tone: "text-emerald-50" },
    { label: "Priority Cases", value: urgentCards, tone: "text-[#f8e7bb]" },
  ]

  const upcomingSchedule = useMemo(() => {
    return scopedWorkflow
      .flatMap((lane) =>
        lane.cards.map((card) => {
          const lower = `${card.title} ${card.type}`.toLowerCase()
          const isSurgery =
            lower.includes("surgical") ||
            lower.includes("implant") ||
            lower.includes("stim") ||
            lower.includes("reconstruction") ||
            lower.includes("replacement")

          return {
            id: card.id,
            title: card.title,
            date: card.due,
            value: card.value,
            owner: card.assignee,
            lane: lane.title,
            eventType: isSurgery ? "Surgery" : "Delivery",
            detail: `${card.payer} · ${card.type}`,
          }
        }),
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6)
  }, [scopedWorkflow])

  const dailyTasks = useMemo(() => {
    return scopedWorkflow
      .flatMap((lane) =>
        lane.cards.map((card) => {
          const flags = buildAttentionFlags(card, lane.id)
          const isHigh = card.priority === "high"
          const action =
            lane.id === "intake"
              ? card.locked
                ? "Resolve insurance verification and place the order."
                : "Place the order and push auth forward."
              : lane.id === "review"
                ? card.locked
                  ? "Clear documentation blocker and prep appeal response."
                  : "Review chart, update status, and close next action."
                : "Confirm delivery, payment, and chart completion."

          return {
            id: card.id,
            patient: card.title,
            owner: card.assignee,
            due: card.due,
            value: card.value,
            lane: lane.title,
            flags,
            action,
            priorityLabel: isHigh ? "Priority" : card.priority === "med" ? "Today" : "Queue",
            score: (isHigh ? 3 : card.priority === "med" ? 2 : 1) + (card.locked ? 2 : 0),
            href: card.href || "/intake",
          }
        }),
      )
      .sort((a, b) => b.score - a.score || a.due.localeCompare(b.due))
      .slice(0, 6)
  }, [scopedWorkflow])

  const attentionPatients = useMemo(() => {
    return visibleWorkflow
      .flatMap((lane) =>
        lane.cards.map((card) => ({
          ...card,
          laneId: lane.id,
          laneTitle: lane.title,
          flags: buildAttentionFlags(card, lane.id),
        })),
      )
      .filter((card) => card.flags.length > 0)
      .sort((a, b) => {
        const aScore = (a.priority === "high" ? 3 : a.priority === "med" ? 2 : 1) + (a.locked ? 2 : 0)
        const bScore = (b.priority === "high" ? 3 : b.priority === "med" ? 2 : 1) + (b.locked ? 2 : 0)
        return bScore - aScore
      })
      .slice(0, 5)
  }, [visibleWorkflow])

  async function handleTridentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!prompt.trim()) return

    setQueryLoading(true)
    try {
      const response = await queryTrident(prompt, {
        pipeline: Object.fromEntries(workflow.map((lane) => [lane.id, lane.cards.length])),
        accounts: filteredAccounts.slice(0, 6).map((account) => ({
          name: account.name,
          payer: account.payer,
          type: account.type,
          value: account.value,
        })),
      })
      setTridentResponse(response.response || "Trident returned no response.")
    } catch (error) {
      setTridentResponse(
        error instanceof Error ? error.message : "Unable to reach Trident right now.",
      )
    } finally {
      setQueryLoading(false)
    }
  }

  function runTridentPreset(text: string) {
    setPrompt(text)
  }

  async function pushOpsUpdate(message: string, key: string, orderId?: string) {
    setOpsLoadingKey(key)
    try {
      const response = await fetch("/api/communications/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: "ops",
          message_type: "note",
          message,
          order_id: orderId,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null
        throw new Error(payload?.detail || "Unable to post operational update.")
      }

      setOpsMessage("Operational update posted to the live feed.")
      window.setTimeout(() => setOpsMessage(null), 3200)
    } catch (error) {
      setOpsMessage(error instanceof Error ? error.message : "Unable to post operational update.")
      window.setTimeout(() => setOpsMessage(null), 4200)
    } finally {
      setOpsLoadingKey(null)
    }
  }

  function handleDrop(targetLaneId: string) {
    if (!dragging || dragging.laneId === targetLaneId) {
      setDragging(null)
      setDragOverLane(null)
      return
    }

    setWorkflow((current) => {
      const sourceLane = current.find((lane) => lane.id === dragging.laneId)
      const card = sourceLane?.cards.find((item) => item.id === dragging.cardId)
      if (!sourceLane || !card) return current

      return current.map((lane) => {
        if (lane.id === dragging.laneId) {
          return { ...lane, cards: lane.cards.filter((item) => item.id !== dragging.cardId) }
        }
        if (lane.id === targetLaneId) {
          return { ...lane, cards: [...lane.cards, card] }
        }
        return lane
      })
    })

    setDragging(null)
    setDragOverLane(null)
  }

  function moveCardToLane(card: KanbanCard, sourceLaneId: string, targetLaneId: string) {
    if (sourceLaneId === targetLaneId) return

    setWorkflow((current) =>
      current.map((lane) => {
        if (lane.id === sourceLaneId) {
          return { ...lane, cards: lane.cards.filter((item) => item.id !== card.id) }
        }
        if (lane.id === targetLaneId) {
          return { ...lane, cards: [...lane.cards, card] }
        }
        return lane
      }),
    )

    setOpsMessage(`Moved ${card.title} into ${targetLaneId === "review" ? "clinical review" : "completion"}.`)
    window.setTimeout(() => setOpsMessage(null), 2600)
    setFlippedCards((current) => ({ ...current, [card.id]: false }))
  }

  function autoHeal(card: KanbanCard) {
    setWorkflow((current) => {
      const sourceLane = current.find((lane) => lane.cards.some((item) => item.id === card.id))
      if (!sourceLane) return current

      return current.map((lane) => {
        if (lane.id === sourceLane.id) {
          return { ...lane, cards: lane.cards.filter((item) => item.id !== card.id) }
        }
        if (lane.id === "review") {
          return { ...lane, cards: [...lane.cards, { ...card, priority: "low" as const }] }
        }
        return lane
      })
    })
    setFlippedCards((current) => ({ ...current, [card.id]: false }))
  }

  return (
    <main className="poseidon-cinematic-shell min-h-screen overflow-x-hidden text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="poseidon-cinematic-ambient absolute inset-0" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(216,180,106,0.14),transparent_24%),radial-gradient(circle_at_84%_18%,rgba(186,230,253,0.18),transparent_22%),radial-gradient(circle_at_50%_100%,rgba(17,119,255,0.16),transparent_32%),linear-gradient(180deg,#08131f_0%,#0b1727_44%,#0d1e31_100%)]" />
        <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(159,196,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(159,196,255,0.04)_1px,transparent_1px)] [background-size:112px_112px]" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-[1760px] flex-col px-4 pb-8 pt-5 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-4 xl:flex-row xl:items-center">
            <div className="poseidon-title-block">
              <p className="font-mono text-[11px] uppercase tracking-[0.44em] text-cyan-200/80">
                Poseidon // Enterprise OS
              </p>
              <h1 className="mt-2 font-display text-4xl uppercase tracking-[0.16em] text-white sm:text-5xl">
                Operations Deck
              </h1>
            </div>

            <label className="poseidon-search-panel poseidon-glass flex w-full max-w-[560px] items-center gap-3 rounded-full border px-5 py-3">
              <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
              <input
                id="poseidon-global-search"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search patient, payer, HCPCS, case, or order signature..."
                type="search"
                value={search}
              />
              <span className="hidden rounded-full border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:block">
                cmd+f
              </span>
            </label>
          </div>

          <div className="flex items-center gap-4 self-start xl:self-auto">
            <button
              className={cn(
                "rounded-full border px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.26em] transition",
                focusMode
                  ? "border-[#f4e7c5] bg-[#f4e7c5] text-slate-950 shadow-[0_0_36px_rgba(244,231,197,0.2)]"
                  : "border-white/10 bg-white/[0.04] text-slate-200 hover:border-[#d8b46a]/40 hover:bg-[#d8b46a]/10",
              )}
              onClick={() => setFocusMode((current) => !current)}
              type="button"
            >
              Focus Suite {focusMode ? "On" : "Off"}
            </button>

            <div className="flex items-center gap-4 rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{userName}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#d8b46a]">
                  {String(userRole).replace(/\s+/g, "_")}
                </p>
              </div>
              <div className="relative h-16 w-16">
                <svg className="h-16 w-16" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                  <circle
                    className="transition-all duration-1000"
                    cx="32"
                    cy="32"
                    fill="none"
                    r="28"
                    stroke="#d8b46a"
                    strokeDasharray="176"
                    strokeDashoffset={ringOffset}
                    strokeWidth="3"
                    style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-white">
                  {systemLoad}%
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-6 flex flex-wrap gap-3">
          {businessLineTabs.map((tab) => {
            const isActive = activeBusinessLine === tab.id
            const scopedCount =
              tab.id === "all"
                ? workflow.reduce((sum, lane) => sum + lane.cards.length, 0)
                : workflow.reduce(
                    (sum, lane) => sum + lane.cards.filter((card) => card.businessLine === tab.id).length,
                    0,
                  )

            return (
              <button
                key={tab.id}
                className={cn(
                  "rounded-[22px] border px-4 py-3 text-left transition",
                  isActive
                    ? "border-cyan-200/40 bg-[linear-gradient(180deg,rgba(186,230,253,0.16),rgba(186,230,253,0.06))] shadow-[0_0_28px_rgba(125,211,252,0.08)]"
                    : "border-white/10 bg-white/[0.03] hover:border-cyan-200/25 hover:bg-cyan-300/[0.04]",
                )}
                onClick={() => setActiveBusinessLine(tab.id)}
                type="button"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500">{tab.eyebrow}</p>
                <div className="mt-2 flex items-end gap-3">
                  <span className="text-lg font-semibold text-white">{tab.label}</span>
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-cyan-100/80">
                    {String(scopedCount).padStart(2, "0")}
                  </span>
                </div>
              </button>
            )
          })}
        </section>

        <section className="mb-6 grid gap-5 xl:grid-cols-[300px_minmax(0,1.25fr)_360px]">
          <aside className="poseidon-glass rounded-[30px] border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-slate-500">Operating Layers</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Tasks</h2>
              </div>
              <span className="rounded-full border border-[#d8b46a]/30 bg-[#d8b46a]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f8e7bb]">
                online
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {missionControlMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500">{metric.label}</p>
                  <p className={cn("mt-2 font-display text-3xl", metric.tone)}>{metric.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {[
                ["Workflow", `${intakeCount + reviewCount} active items`, "cyan"],
                ["Clinical Review", `${urgentCards} priority chart exceptions`, "gold"],
                ["Revenue", `${completeCount} reconciled ${formatBusinessLineLabel(activeBusinessLine).toLowerCase()} records`, "emerald"],
              ].map(([label, detail, color]) => (
                <div key={label} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        color === "cyan" ? "bg-cyan-200" : color === "gold" ? "bg-[#d8b46a]" : "bg-emerald-200",
                      )}
                    />
                    <p className="text-sm font-semibold text-white">{label}</p>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#d8b46a]">Operational readiness</p>
                <div className="mt-4 grid gap-3">
                  <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                    <span className="text-xs text-slate-400">Queue Pressure</span>
                    <span className="font-mono text-xs text-white">{totalPipeline}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                    <span className="text-xs text-slate-400">Completion Rate</span>
                    <span className="font-mono text-xs text-emerald-100">{completionRatio}%</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-3 py-2">
                    <span className="text-xs text-slate-400">Open Value</span>
                    <span className="font-mono text-xs text-white">{formatCurrency(scopedRevenue)}</span>
                  </div>
                </div>
              </div>

            <div className="mt-5 rounded-[24px] border border-amber-300/25 bg-amber-300/10 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#f8e7bb]">System advisory</p>
              <p className="mt-2 text-sm leading-6 text-slate-100">
                {formatBusinessLineLabel(activeBusinessLine)} is active. Shift tabs without leaving the main workspace.
              </p>
            </div>

            <button
              className="mt-5 w-full rounded-full border border-white/10 bg-white/[0.03] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200 transition hover:border-cyan-300/35 hover:text-white"
              onClick={() => signOut({ callbackUrl: "/login" })}
              type="button"
            >
              Sign out
            </button>
          </aside>

          <div className="space-y-5">
            <div className="poseidon-hero-frame rounded-[34px] border border-white/10 px-6 py-6 sm:px-7">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div>
                  <p className="inline-flex rounded-full border border-cyan-300/25 bg-[linear-gradient(180deg,rgba(186,230,253,0.16),rgba(186,230,253,0.06))] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.34em] text-cyan-50">
                    {formatBusinessLineLabel(activeBusinessLine)} workspace
                  </p>
                  <h2 className="mt-5 text-2xl font-semibold tracking-[0.02em] text-white sm:text-3xl">
                    Daily rep tasks
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                    The highest-impact actions for today across the selected business line, sorted so reps know exactly what needs attention first.
                  </p>

                  {opsMessage ? (
                    <div className="mt-4 rounded-[20px] border border-cyan-300/20 bg-cyan-300/8 px-4 py-3 text-sm text-cyan-50">
                      {opsMessage}
                    </div>
                  ) : null}

                  <div className="mt-6 space-y-3">
                    {dailyTasks.map((task, index) => (
                      <div
                        key={task.id}
                        className="poseidon-stat-tile grid gap-3 rounded-[24px] border border-white/10 bg-black/10 p-4 sm:grid-cols-[92px_minmax(0,1fr)_140px]"
                        style={{ animationDelay: `${index * 90}ms` }}
                      >
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                            {task.priorityLabel}
                          </p>
                          <p className="mt-2 font-display text-3xl text-white">{formatDateLabel(task.due)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-white">{task.patient}</p>
                          <p className="mt-1 text-sm text-slate-300">{task.action}</p>
                          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-100/80">
                            {task.lane} · owner {task.owner}
                          </p>
                          {task.flags.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {task.flags.map((flag) => (
                                <span
                                  key={flag}
                                  className="rounded-full border border-[#d8b46a]/20 bg-[#d8b46a]/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#f8e7bb]"
                                >
                                  {flag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                          <p className="font-display text-3xl text-white">{task.value}</p>
                          <Link
                            className="mt-2 inline-block rounded-full border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-200 transition hover:border-cyan-300/35 hover:text-white"
                            href={task.href}
                          >
                            Open chart
                          </Link>
                        </div>
                      </div>
                    ))}
                    {!dailyTasks.length ? (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-black/10 px-4 py-10 text-center text-sm text-slate-500">
                        No rep tasks are currently queued in this scope.
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {commandStats.map((stat, index) => (
                      <div
                        key={stat.label}
                        className="poseidon-stat-tile rounded-[24px] border border-white/10 bg-black/10 p-4"
                        style={{ animationDelay: `${(index + 6) * 90}ms` }}
                      >
                        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">{stat.label}</p>
                        <p className="mt-3 font-display text-4xl text-white">{stat.value}</p>
                        <p className="mt-2 text-xs text-[#f4e7c5]/80">{stat.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.12))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500">System pulse</p>
                    <div className="mt-4 space-y-4">
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Review load</span>
                          <span>{reviewCount}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#7dd3fc,#60a5fa)]"
                            style={{ width: `${Math.max(12, Math.min(100, reviewCount * 12))}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Urgent breakpoints</span>
                          <span>{urgentCards}</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#fb7185,#fdba74)]"
                            style={{ width: `${Math.max(12, Math.min(100, urgentCards * 14))}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Resolved vector</span>
                          <span>{completionRatio}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#6ee7b7,#67e8f9)]"
                            style={{ width: `${Math.max(8, completionRatio)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.12))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500">Network status</p>
                    <p className="mt-3 text-lg font-semibold text-white">
                      {new Date(initialSystemState.lastSync).toLocaleString()}
                    </p>
                    <p className="mt-2 text-sm text-slate-400">
                      Services online: {initialSystemState.services.join(" · ")}
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      {initialSystemState.services.map((service) => (
                        <span
                          key={service}
                          className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="poseidon-glass rounded-[32px] border p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-slate-500">Workflow orchestration</p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">Main board</h3>
                  </div>
                  <p className="max-w-xl text-sm leading-6 text-slate-400">
                    Move {formatBusinessLineLabel(activeBusinessLine).toLowerCase()} cases through intake, review, and completion.
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  {visibleWorkflow.map((lane) => {
                    const tone = toneClasses[lane.tone]
                    const isDimmed = focusMode && activeLaneId !== lane.id

                    return (
                      <section
                        key={lane.id}
                        className={cn(
                          "rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-4 transition duration-500",
                          tone.glow,
                          isDimmed && "scale-[0.97] blur-[2px] brightness-50",
                          dragOverLane === lane.id && "border-cyan-300/35 bg-cyan-300/6",
                        )}
                        onDragLeave={() => setDragOverLane(null)}
                        onDragOver={(event) => {
                          event.preventDefault()
                          setDragOverLane(lane.id)
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          handleDrop(lane.id)
                        }}
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500">{lane.eyebrow}</p>
                            <h4 className="mt-2 text-lg font-semibold text-white">{lane.title}</h4>
                          </div>
                          <span className={cn("rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em]", tone.pill)}>
                            {String(lane.cards.length).padStart(2, "0")}
                          </span>
                        </div>

                        <div className="space-y-4">
                          {lane.cards.map((card) => {
                            const isFlipped = Boolean(flippedCards[card.id])
                            const progress = getProgressByLane(lane.id)

                            return (
                              <div
                                key={card.id}
                                className="min-h-[320px] [perspective:1400px]"
                                draggable
                                onDragEnd={() => {
                                  setDragging(null)
                                  setDragOverLane(null)
                                }}
                                onDragStart={() => setDragging({ cardId: card.id, laneId: lane.id })}
                              >
                                <div
                                  className="relative min-h-[320px] w-full transition-transform duration-700 [transform-style:preserve-3d]"
                                  style={{ transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
                                >
                                  <div className="poseidon-card-face absolute inset-0 flex flex-col rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))] p-5 [backface-visibility:hidden]">
                                    <div className="flex items-start justify-between gap-3">
                                      <span className={cn("rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]", priorityClasses[card.priority])}>
                                        {card.priority === "high" ? "priority" : card.priority === "med" ? "monitor" : "stable"}
                                      </span>
                                      <span className={cn("mt-1 h-3 w-3 rounded-full shadow-[0_0_18px_currentColor]", tone.dot, card.priority === "high" && "animate-pulse")} />
                                    </div>

                                    <div className="mt-5">
                                      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">{card.id}</p>
                                      <h5 className="mt-3 text-xl font-semibold leading-tight text-white">{card.title}</h5>
                                      <p className="mt-2 text-sm text-slate-400">
                                        {card.type} · {card.payer} · assignee {card.assignee}
                                      </p>
                                    </div>

                                    <div className="mt-5 rounded-[22px] border border-white/8 bg-black/20 p-4">
                                      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-slate-500">
                                        <span>Completion path</span>
                                        <span>{progress}%</span>
                                      </div>
                                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                                        <div className={cn("h-full rounded-full bg-gradient-to-r", tone.progress)} style={{ width: `${progress}%` }} />
                                      </div>
                                      <p className="mt-3 text-xs leading-5 text-slate-400">{getStatusCopy(card)}</p>
                                    </div>

                                    <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                                      <div>
                                        <p className="font-display text-3xl text-white">{card.value}</p>
                                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">Due {card.due}</p>
                                      </div>
                                      <button
                                        className="rounded-full border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100 transition hover:border-cyan-300/35 hover:text-white"
                                        onClick={(event) => {
                                          event.preventDefault()
                                          event.stopPropagation()
                                          setFlippedCards((current) => ({ ...current, [card.id]: !current[card.id] }))
                                        }}
                                        type="button"
                                      >
                                        Inspect
                                      </button>
                                    </div>
                                  </div>

                                  <div
                                    className="absolute inset-0 flex rounded-[24px] border border-cyan-300/20 bg-[linear-gradient(160deg,rgba(4,10,22,0.98),rgba(9,18,35,0.98))] p-5 [backface-visibility:hidden]"
                                    style={{ transform: "rotateY(180deg)" }}
                                  >
                                    <div className="flex h-full w-full flex-col">
                                      <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-4">
                                        <div>
                                          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#f4e7c5]">Record intelligence</p>
                                          <h5 className="mt-2 text-lg font-semibold text-white">{card.id}</h5>
                                        </div>
                                        <button
                                          className="rounded-full border border-white/10 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-300 transition hover:border-white/20 hover:text-white"
                                          onClick={(event) => {
                                            event.preventDefault()
                                            event.stopPropagation()
                                            setFlippedCards((current) => ({ ...current, [card.id]: false }))
                                          }}
                                          type="button"
                                        >
                                          Front
                                        </button>
                                      </div>

                                      <div className="mt-4 grid gap-3 text-xs">
                                        <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                                          <span className="text-slate-400">Linked orders</span>
                                          <span className="text-emerald-100">{card.orderCount || card.orderIds?.length || 1}</span>
                                        </div>
                                        <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                                          <span className="text-slate-400">Workflow gate</span>
                                          <span className={card.locked ? "text-rose-200" : "text-cyan-100"}>
                                            {card.locked ? "blocked" : "clear"}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                                          <span className="text-slate-400">Document signal</span>
                                          <span className={card.locked ? "text-amber-100" : "text-emerald-100"}>
                                            {card.locked ? "partial" : "verified"}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="mt-5 grid grid-cols-2 gap-2">
                                        {card.href ? (
                                          <Link
                                            className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100 transition hover:border-cyan-300/30 hover:text-white"
                                            href={card.href}
                                            onClick={(event) => event.stopPropagation()}
                                          >
                                            Open patient
                                          </Link>
                                        ) : null}
                                        <button
                                          className="rounded-2xl border border-cyan-300/25 bg-[linear-gradient(180deg,rgba(186,230,253,0.15),rgba(186,230,253,0.05))] px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/16"
                                          onClick={(event) => {
                                            event.preventDefault()
                                            event.stopPropagation()
                                            setActiveDocument({ type: "SWO", card })
                                          }}
                                          type="button"
                                        >
                                          View SWO
                                        </button>
                                        <button
                                          className="rounded-2xl border border-cyan-300/25 bg-[linear-gradient(180deg,rgba(186,230,253,0.15),rgba(186,230,253,0.05))] px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/16"
                                          onClick={(event) => {
                                            event.preventDefault()
                                            event.stopPropagation()
                                            runTridentPreset(
                                              `Review ${card.title} in ${lane.title}. Payer ${card.payer}. Priority ${card.priority}. Summarize the next operational step and the biggest reimbursement risk.`,
                                            )
                                          }}
                                          type="button"
                                        >
                                          Next step
                                        </button>
                                        {lane.id === "intake" ? (
                                          <button
                                            className="col-span-2 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-50 transition hover:bg-cyan-300/16"
                                            onClick={(event) => {
                                              event.preventDefault()
                                              event.stopPropagation()
                                              moveCardToLane(card, lane.id, "review")
                                            }}
                                            type="button"
                                          >
                                            Send to review
                                          </button>
                                        ) : null}
                                        {lane.id === "review" ? (
                                          <button
                                            className="col-span-2 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-50 transition hover:bg-emerald-300/16"
                                            onClick={(event) => {
                                              event.preventDefault()
                                              event.stopPropagation()
                                              moveCardToLane(card, lane.id, "complete")
                                            }}
                                            type="button"
                                          >
                                            Mark ready
                                          </button>
                                        ) : null}
                                        <button
                                          className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100 transition hover:border-cyan-300/30 hover:text-white disabled:opacity-60"
                                          disabled={opsLoadingKey === card.id}
                                          onClick={(event) => {
                                              event.preventDefault()
                                              event.stopPropagation()
                                              void pushOpsUpdate(
                                              `${lane.title}: ${card.title} requires operator review. ${card.lockReason || "Queue follow-up requested."}`,
                                                card.id,
                                                card.orderIds?.[0],
                                              )
                                          }}
                                          type="button"
                                        >
                                          {opsLoadingKey === card.id ? "Posting..." : "Flag ops"}
                                        </button>
                                        {lane.id !== "complete" ? (
                                          <button
                                            className="col-span-2 rounded-2xl border border-emerald-300/25 bg-[linear-gradient(180deg,rgba(187,247,208,0.14),rgba(187,247,208,0.05))] px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-300/16"
                                            onClick={(event) => {
                                              event.preventDefault()
                                              event.stopPropagation()
                                              autoHeal(card)
                                            }}
                                            type="button"
                                          >
                                            Auto heal protocol
                                          </button>
                                        ) : (
                                          <Link
                                            className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100 transition hover:border-cyan-300/30 hover:text-white"
                                            href={card.href || "/intake"}
                                            onClick={(event) => event.stopPropagation()}
                                          >
                                            Open chart
                                          </Link>
                                        )}
                                      </div>

                                      <p className="mt-auto pt-4 text-xs leading-5 text-slate-500">
                                        {card.lockReason || "Record is coherent enough to move. No major structural blockers detected."}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}

                          {!lane.cards.length ? (
                            <div className="rounded-[24px] border border-dashed border-white/10 bg-black/10 px-4 py-10 text-center text-sm text-slate-500">
                              No records matched the active command query.
                            </div>
                          ) : null}
                        </div>
                      </section>
                    )
                  })}
                </div>
              </div>

              <aside className="space-y-5">
                <div className="poseidon-glass rounded-[30px] border p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-slate-500">Attention queue</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Patients requiring action</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Auth issues, insurance verification gaps, appeals, denials, and orders that still need to be placed.
                  </p>
                  <div className="mt-4 space-y-3">
                    {attentionPatients.map((card, index) => {
                      const flipKey = `attention-${card.id}`
                      const isFlipped = Boolean(flippedCards[flipKey])

                      return (
                        <div key={card.id} className="min-h-[260px] [perspective:1400px]">
                          <div
                            className="relative min-h-[260px] w-full transition-transform duration-700 [transform-style:preserve-3d]"
                            style={{ transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
                          >
                            <div className="absolute inset-0 flex flex-col rounded-[24px] border border-white/8 bg-white/[0.03] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.24)] [backface-visibility:hidden]">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-white">{card.title}</p>
                                  <p className="mt-1 text-xs text-slate-400">{card.payer} · {card.type}</p>
                                </div>
                                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                  0{index + 1}
                                </span>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                {card.flags.map((flag) => (
                                  <span
                                    key={flag}
                                    className="rounded-full border border-[#d8b46a]/25 bg-[#d8b46a]/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#f8e7bb]"
                                  >
                                    {flag}
                                  </span>
                                ))}
                              </div>

                              <div className="mt-4 rounded-[20px] border border-white/8 bg-black/20 p-3">
                                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                  {card.laneTitle} · owner {card.assignee}
                                </p>
                                <p className="mt-2 text-xs leading-5 text-slate-400">
                                  {card.lockReason || "Requires active follow-up before the next handoff."}
                                </p>
                              </div>

                              <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                                <div>
                                  <p className="font-display text-3xl text-white">{card.value}</p>
                                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-cyan-100/80">
                                    Due {card.due}
                                  </p>
                                </div>
                                <button
                                  className="rounded-full border border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:border-cyan-300/35 hover:text-white"
                                  onClick={() =>
                                    setFlippedCards((current) => ({ ...current, [flipKey]: !current[flipKey] }))
                                  }
                                  type="button"
                                >
                                  Flip
                                </button>
                              </div>
                            </div>

                            <div
                              className="absolute inset-0 flex flex-col rounded-[24px] border border-cyan-300/20 bg-[linear-gradient(160deg,rgba(4,10,22,0.98),rgba(9,18,35,0.98))] p-4 [backface-visibility:hidden]"
                              style={{ transform: "rotateY(180deg)" }}
                            >
                              <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-3">
                                <div>
                                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#f4e7c5]">
                                    Full patient chart
                                  </p>
                                  <p className="mt-2 text-sm font-semibold text-white">{card.title}</p>
                                </div>
                                <button
                                  className="rounded-full border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-slate-300 transition hover:border-white/20 hover:text-white"
                                  onClick={() => setFlippedCards((current) => ({ ...current, [flipKey]: false }))}
                                  type="button"
                                >
                                  Front
                                </button>
                              </div>

                              <div className="mt-4 grid gap-3 text-xs">
                                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                                  <span className="text-slate-400">Primary issue</span>
                                  <span className="text-cyan-100">{card.flags[0]}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                                  <span className="text-slate-400">Linked orders</span>
                                  <span className="text-emerald-100">{card.orderCount || card.orderIds?.length || 1}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                                  <span className="text-slate-400">Chart status</span>
                                  <span className={card.locked ? "text-amber-100" : "text-emerald-100"}>
                                    {card.locked ? "Needs verification" : "Review ready"}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
                                <Link
                                  className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100 transition hover:border-cyan-300/30 hover:text-white"
                                  href={card.href || "/intake"}
                                >
                                  Open full chart
                                </Link>
                                <button
                                  className="rounded-2xl border border-cyan-300/25 bg-[linear-gradient(180deg,rgba(186,230,253,0.15),rgba(186,230,253,0.05))] px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-300/16"
                                  onClick={() => setActiveDocument({ type: "CLINICAL", card })}
                                  type="button"
                                >
                                  Clinical
                                </button>
                                <button
                                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-100 transition hover:border-cyan-300/30 hover:text-white"
                                  onClick={() =>
                                    runTridentPreset(
                                      `Review ${card.title}. Current lane ${card.laneTitle}. Flags: ${card.flags.join(", ")}. Summarize payer risk, auth status, and the next operator action.`,
                                    )
                                  }
                                  type="button"
                                >
                                  Review
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {!attentionPatients.length ? (
                      <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-sm text-slate-500">
                        No patients currently require escalated attention in this scope.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="poseidon-glass rounded-[30px] border p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-slate-500">Trident intelligence</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Executive query</h3>
                  <form className="mt-4 space-y-3" onSubmit={handleTridentSubmit}>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "Which queue needs attention first?",
                        "Show the highest reimbursement risk items.",
                        "Which records are blocked by documentation?",
                      ].map((preset) => (
                        <button
                          key={preset}
                          className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-slate-300 transition hover:border-cyan-300/35 hover:text-white"
                          onClick={() => runTridentPreset(preset)}
                          type="button"
                        >
                          Preset
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="min-h-[132px] w-full rounded-[24px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/35"
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder="Which records present the highest near-term reimbursement risk?"
                      value={prompt}
                    />
                    <button
                      className="w-full rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-300/16 disabled:opacity-60"
                      disabled={queryLoading}
                      type="submit"
                    >
                      {queryLoading ? "Running check..." : "Run Trident"}
                    </button>
                  </form>
                  <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm leading-6 text-slate-300">
                    {tridentResponse}
                  </div>
                </div>
              </aside>
            </div>
          </div>

          <aside className="poseidon-glass rounded-[30px] border p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-slate-500">Operations</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Operations summary</h3>

            <div className="mt-5 grid gap-3">
              {[
                [
                  "Intake queue",
                  scopedWorkflow.find((lane) => lane.id === "intake")?.cards.length || 0,
                  formatCurrency(sumCardValues(scopedWorkflow.find((lane) => lane.id === "intake")?.cards || [])),
                ],
                [
                  "Review blockers",
                  scopedWorkflow.find((lane) => lane.id === "review")?.cards.filter((card) => card.locked).length || 0,
                  `${scopedWorkflow.find((lane) => lane.id === "review")?.cards.filter((card) => card.priority === "high").length || 0} priority`,
                ],
                [
                  "Completed",
                  scopedWorkflow.find((lane) => lane.id === "complete")?.cards.length || 0,
                  formatCurrency(scopedPaidValue),
                ],
              ].map(([label, count, value]) => (
                <div key={label} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="font-display text-2xl text-white">{String(count)}</p>
                  </div>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-[28px] border border-white/8 bg-black/20 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500">Coverage</p>
              <p className="mt-3 text-lg font-semibold text-white">{filteredAccounts.length} active patient records</p>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#f4e7c5]">{formatBusinessLineLabel(activeBusinessLine)} in view</p>
              <p className="mt-4 text-sm leading-6 text-slate-400">
                Search, tasks, and workflow stay on the operations deck. Payer exposure now lives in the payments and billing dashboard.
              </p>
            </div>

            <div className="mt-5 rounded-[28px] border border-white/8 bg-black/20 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500">Identity</p>
              <p className="mt-3 text-lg font-semibold text-white">{userName}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#f4e7c5]">{String(userRole)}</p>
              <p className="mt-4 text-sm leading-6 text-slate-400">
                Ports {initialSystemState.ports}. Operators online: {initialSystemState.operators.join(", ")}.
              </p>
            </div>
          </aside>
        </section>
      </div>

      {activeDocument ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-2xl">
          <div className="poseidon-glass h-[80vh] w-full max-w-5xl rounded-[36px] border p-7 sm:p-8">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-cyan-100">
                  Neural stream : {activeDocument.type}_encrypted
                </p>
                <p className="mt-2 text-xl font-semibold text-white">
                  {activeDocument.card?.title || "Workflow document"}
                </p>
              </div>
              <button
                className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100 transition hover:bg-cyan-300/16"
                onClick={() => setActiveDocument(null)}
                type="button"
              >
                Esc to close
              </button>
            </div>

            <div className="flex h-[calc(80vh-7rem)] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-44 w-36 rounded-[24px] border-2 border-dashed border-cyan-300/55 bg-cyan-300/6" />
                <p className="mt-6 font-mono text-sm uppercase tracking-[0.28em] text-slate-300">
                  Syncing neural document stream...
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .poseidon-glass {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.018));
          backdrop-filter: blur(26px) saturate(145%);
          -webkit-backdrop-filter: blur(26px) saturate(145%);
          box-shadow:
            0 24px 80px rgba(2, 8, 20, 0.42),
            inset 0 1px 0 rgba(255, 255, 255, 0.12),
            inset 0 -1px 0 rgba(255, 255, 255, 0.03);
        }

        .poseidon-cinematic-ambient {
          background:
            radial-gradient(circle at 28% 64%, rgba(186, 230, 253, 0.12) 0%, transparent 28%),
            radial-gradient(circle at 70% 26%, rgba(216, 180, 106, 0.08) 0%, transparent 22%),
            radial-gradient(circle at 46% 18%, rgba(187, 247, 208, 0.06) 0%, transparent 20%);
          animation: ambientRotate 22s ease-in-out infinite;
          transform-origin: center;
        }

        .poseidon-title-block {
          animation: riseIn 700ms cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }

        .poseidon-search-panel {
          border-color: rgba(255, 255, 255, 0.09);
          transition:
            transform 220ms ease,
            border-color 220ms ease,
            box-shadow 220ms ease,
            background 220ms ease;
        }

        .poseidon-search-panel:focus-within {
          transform: translateY(-1px);
          border-color: rgba(216, 180, 106, 0.42);
          background: linear-gradient(180deg, rgba(216, 180, 106, 0.12), rgba(255, 255, 255, 0.03));
          box-shadow: 0 0 36px rgba(216, 180, 106, 0.12);
        }

        .poseidon-hero-frame {
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at top right, rgba(186, 230, 253, 0.14), transparent 24%),
            radial-gradient(circle at left center, rgba(216, 180, 106, 0.1), transparent 20%),
            linear-gradient(145deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
          box-shadow:
            0 34px 100px rgba(0, 0, 0, 0.38),
            inset 0 1px 0 rgba(255, 255, 255, 0.14),
            inset 0 -1px 0 rgba(255, 255, 255, 0.03);
        }

        .poseidon-hero-frame::before {
          content: "";
          position: absolute;
          inset: 12px;
          border: 1px solid rgba(216, 180, 106, 0.08);
          border-radius: 28px;
          pointer-events: none;
        }

        .poseidon-card-face {
          box-shadow:
            0 24px 72px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.06);
          transition:
            transform 240ms ease,
            border-color 240ms ease,
            box-shadow 240ms ease;
        }

        .poseidon-card-face:hover {
          transform: translateY(-4px) scale(1.01);
          border-color: rgba(216, 180, 106, 0.18);
          box-shadow: 0 32px 90px rgba(0, 0, 0, 0.42);
        }

        .poseidon-stat-tile {
          opacity: 0;
          animation: riseIn 800ms cubic-bezier(0.18, 0.89, 0.32, 1.14) forwards;
        }

        @keyframes ambientRotate {
          0%,
          100% {
            opacity: 0.72;
            transform: rotate(0deg) scale(1);
          }
          50% {
            opacity: 1;
            transform: rotate(180deg) scale(1.08);
          }
        }

        @keyframes riseIn {
          0% {
            opacity: 0;
            transform: translateY(24px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  )
}
