"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

import { PodDeliveryGuidancePanel, type PodDeliveryGuidancePayload } from "@/components/patient/PodDeliveryGuidancePanel"
import { moveKanbanCard } from "@/lib/api"
import { KANBAN_DATA, type KanbanCard, type KanbanColumn } from "@/lib/data"

type ChartDocument = {
  id?: string
  file_name?: string
  download_url?: string
}

type ChartOrder = {
  id: string
  status?: string
  hcpcs_codes?: string[]
  billing_status?: string
  swo_status?: string
  primary_documents?: {
    swo?: ChartDocument | null
    cms1500?: ChartDocument | null
    pod?: ChartDocument | null
  }
}

type ChartItem = {
  id?: string
  paid_amount?: number | string
  denied_amount?: number | string
  denial_category?: string
  status?: string
  claim_number?: string
  claim_status?: string
}

type PatientChart = {
  patient: {
    id: string
    first_name?: string
    last_name?: string
  }
  pod_delivery_guidance?: PodDeliveryGuidancePayload | null
  summary: {
    total_orders: number
    signed_swo_count: number
    payments_count: number
    denials_count: number
    appeals_count: number
    eobs_count: number
    paid_amount_total: number
    denied_amount_total: number
  }
  orders: ChartOrder[]
  payments: ChartItem[]
  denials: ChartItem[]
  appeals: ChartItem[]
  eobs: ChartItem[]
}

interface KanbanBoardProps {
  initialColumns?: Record<string, KanbanColumn>
}

function formatCurrency(value: number | string | undefined) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value || "")
  if (!Number.isFinite(numeric)) return "Pending"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(numeric)
}

function DocumentPill({
  label,
  document,
}: {
  label: string
  document?: ChartDocument | null
}) {
  if (!document?.id) {
    return <span className="rounded-full bg-white/5 px-2 py-1 text-[9px] text-slate-500">{label}: none</span>
  }
  if (!document.download_url) {
    return <span className="rounded-full bg-white/5 px-2 py-1 text-[9px] text-slate-300">{label}</span>
  }
  return (
    <a
      className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-2 py-1 text-[9px] text-accent-blue transition hover:text-white"
      href={document.download_url}
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </a>
  )
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] text-slate-300">
      {label}: {value}
    </span>
  )
}

export default function KanbanBoard({
  initialColumns = KANBAN_DATA,
}: KanbanBoardProps) {
  const [columns, setColumns] = useState(initialColumns)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [draggingFromCol, setDraggingFromCol] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({})
  const [patientCharts, setPatientCharts] = useState<Record<string, PatientChart>>({})
  const [loadingPatientId, setLoadingPatientId] = useState<string | null>(null)
  const [chartErrors, setChartErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setColumns(initialColumns)
  }, [initialColumns])

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3000)
  }

  const loadPatientChart = useCallback(async (patientId: string) => {
    setLoadingPatientId(patientId)
    setChartErrors((prev) => ({ ...prev, [patientId]: "" }))
    try {
      const res = await fetch(`/api/patients/${patientId}/chart`, { cache: "no-store" })
      const data = (await res.json()) as PatientChart & { error?: string }
      if (!res.ok) {
        throw new Error(data.error || "Unable to load patient chart.")
      }
      setPatientCharts((prev) => ({ ...prev, [patientId]: data }))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load patient chart."
      setChartErrors((prev) => ({ ...prev, [patientId]: message }))
    } finally {
      setLoadingPatientId((current) => (current === patientId ? null : current))
    }
  }, [])

  const handleFlip = useCallback(
    async (card: KanbanCard) => {
      if (!card.patientId) return
      const nextValue = !flippedCards[card.id]
      setFlippedCards((prev) => ({ ...prev, [card.id]: nextValue }))
      if (nextValue && !patientCharts[card.patientId] && loadingPatientId !== card.patientId) {
        await loadPatientChart(card.patientId)
      }
    },
    [flippedCards, loadPatientChart, loadingPatientId, patientCharts],
  )

  const refreshPatientChart = useCallback(
    async (patientId?: string) => {
      if (!patientId) return
      await loadPatientChart(patientId)
      showToast("Patient chart refreshed")
    },
    [loadPatientChart],
  )

  const handleDragStart = useCallback((cardId: string, colId: string) => {
    setDraggingId(cardId)
    setDraggingFromCol(colId)
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, colId: string) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      setDragOverCol(colId)
    },
    [],
  )

  const handleDragLeave = useCallback(() => {
    setDragOverCol(null)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, targetColId: string) => {
      e.preventDefault()
      setDragOverCol(null)

      if (!draggingId || !draggingFromCol || draggingFromCol === targetColId) {
        setDraggingId(null)
        setDraggingFromCol(null)
        return
      }

      const draggedCard = columns[draggingFromCol]?.cards.find((card) => card.id === draggingId)
      if (draggedCard?.locked) {
        showToast(draggedCard.lockReason || "This patient cannot move yet.")
        setDraggingId(null)
        setDraggingFromCol(null)
        return
      }

      const previousColumns = columns
      setColumns((prev) => {
        const next = { ...prev }
        const srcCards = [...next[draggingFromCol].cards]
        const idx = srcCards.findIndex((card) => card.id === draggingId)
        if (idx === -1) return prev
        const [moved] = srcCards.splice(idx, 1)
        next[draggingFromCol] = { ...next[draggingFromCol], cards: srcCards }
        next[targetColId] = {
          ...next[targetColId],
          cards: [...next[targetColId].cards, moved],
        }
        return next
      })

      try {
        await moveKanbanCard(
          draggingId,
          draggingFromCol,
          targetColId,
          draggedCard?.orderIds || [],
        )
      } catch (error) {
        setColumns(previousColumns)
        showToast(error instanceof Error ? error.message : "Move blocked.")
        setDraggingId(null)
        setDraggingFromCol(null)
        return
      }

      const targetLabel = initialColumns[targetColId]?.label || targetColId
      showToast(`${draggingId} moved to ${targetLabel}`)
      setDraggingId(null)
      setDraggingFromCol(null)
    },
    [columns, draggingFromCol, draggingId, initialColumns],
  )

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
    setDraggingFromCol(null)
    setDragOverCol(null)
  }, [])

  const priorityStyles: Record<string, { bg: string; color: string }> = {
    high: { bg: "rgba(224,58,58,0.15)", color: "#e03a3a" },
    med: { bg: "rgba(212,130,15,0.15)", color: "#d4820f" },
    low: { bg: "rgba(15,168,106,0.15)", color: "#0fa86a" },
  }

  return (
    <div className="relative">
      {toast && (
        <div className="fixed bottom-4 right-4 z-[999] max-w-[calc(100vw-2rem)] rounded-md border border-accent-green bg-navy-3 px-4 py-2 text-xs font-medium text-accent-green shadow-lg sm:bottom-6 sm:right-6">
          {toast}
        </div>
      )}

      <div className="flex min-h-[500px] snap-x gap-4 overflow-x-auto px-1 py-4 pb-6">
        {Object.values(columns).map((col) => (
          <div
            key={col.id}
            className="flex w-[min(82vw,300px)] shrink-0 snap-start flex-col gap-2 sm:w-[300px] xl:w-[320px]"
          >
            <div
              className="flex items-center justify-between rounded-md px-3 py-2"
              style={{ background: `${col.color}18` }}
            >
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: col.color }}
              >
                {col.label}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ background: `${col.color}25`, color: col.color }}
              >
                {col.cards.length}
              </span>
            </div>

            <div
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              className="flex min-h-20 flex-1 flex-col gap-3 rounded-md p-1 transition-colors"
              style={{
                background:
                  dragOverCol === col.id ? "rgba(26,110,245,0.08)" : "transparent",
                border:
                  dragOverCol === col.id
                    ? "1px dashed rgba(26,110,245,0.4)"
                    : "1px solid transparent",
              }}
            >
              {col.cards.map((card) => {
                const isFlipped = Boolean(flippedCards[card.id])
                const chart = card.patientId ? patientCharts[card.patientId] : undefined
                const isLoading = loadingPatientId === card.patientId
                const chartError = card.patientId ? chartErrors[card.patientId] : ""

                return (
                  <div
                    key={card.id}
                    className="min-h-[296px] [perspective:1400px]"
                    draggable
                    onDragStart={() => handleDragStart(card.id, col.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <div
                      className="relative h-full min-h-[296px] w-full transition-transform duration-500 [transform-style:preserve-3d]"
                      style={{
                        transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                        opacity: draggingId === card.id ? 0.4 : 1,
                      }}
                    >
                      <div
                        className="absolute inset-0 cursor-grab select-none rounded-2xl border bg-navy-3 px-3 py-3 shadow-[0_16px_48px_rgba(5,8,15,0.35)] [backface-visibility:hidden]"
                        style={{
                          borderColor:
                            draggingId === card.id
                              ? "rgba(26,110,245,0.6)"
                              : "rgba(40,90,180,0.18)",
                        }}
                      >
                        <div className="mb-1.5 flex justify-between">
                          <span className="font-mono text-[9px] text-[#4a6a90]">
                            {card.id}
                          </span>
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px]"
                            style={{
                              background: priorityStyles[card.priority].bg,
                              color: priorityStyles[card.priority].color,
                            }}
                          >
                            {card.priority.toUpperCase()}
                          </span>
                        </div>

                        <div className="mb-1 text-[13px] font-bold text-accent-gold-2">
                          {card.value}
                        </div>

                        <div className="mb-2 text-[12px] font-medium leading-[1.35] text-[#c8dff5]">
                          {card.title}
                        </div>

                        <div className="mb-3 flex flex-wrap gap-1">
                          <span className="rounded-full border border-[rgba(26,110,245,0.2)] bg-[rgba(26,110,245,0.1)] px-1.5 py-0.5 text-[9px] text-accent-blue">
                            {card.type}
                          </span>
                          <span className="rounded-full bg-[rgba(74,106,144,0.15)] px-1.5 py-0.5 text-[9px] text-[#7a9bc4]">
                            {card.payer}
                          </span>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/10 p-3 text-[11px] text-slate-300">
                          <p className="font-semibold text-white">Lifecycle preview</p>
                          <p className="mt-2">Orders linked: {card.orderCount || card.orderIds?.length || 0}</p>
                          <p>Workflow gate: {card.locked ? card.lockReason || "Blocked" : "Ready to move"}</p>
                          <p>Due marker: {card.due}</p>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent-blue text-[9px] font-bold text-white">
                            {card.assignee}
                          </div>
                          <div className="flex items-center gap-2">
                            {card.href && (
                              <Link
                                href={card.href}
                                className="rounded-full border border-[rgba(26,110,245,0.28)] px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-accent-blue hover:border-accent-blue"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Chart
                              </Link>
                            )}
                            {card.patientId ? (
                              <button
                                className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-slate-200 transition hover:border-accent-gold hover:text-accent-gold-2"
                                onClick={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  void handleFlip(card)
                                }}
                                type="button"
                              >
                                Flip
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div
                        className="absolute inset-0 overflow-hidden rounded-2xl border border-accent-blue/20 bg-[linear-gradient(180deg,rgba(8,16,28,0.98),rgba(5,8,15,0.98))] px-3 py-3 [backface-visibility:hidden]"
                        style={{ transform: "rotateY(180deg)" }}
                      >
                        <div className="flex h-full flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.2em] text-accent-blue">Patient Chart</p>
                              <p className="mt-1 text-sm font-semibold text-white">{card.title.split(" - ")[0]}</p>
                            </div>
                            <button
                              className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-slate-300 transition hover:border-white/20 hover:text-white"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                void handleFlip(card)
                              }}
                              type="button"
                            >
                              Front
                            </button>
                          </div>

                          {isLoading ? (
                            <div className="mt-4 flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-black/10 text-xs text-slate-400">
                              Loading patient chart...
                            </div>
                          ) : chartError ? (
                            <div className="mt-4 flex flex-1 items-center justify-center rounded-2xl border border-accent-red/20 bg-accent-red/10 px-4 text-center text-xs text-accent-red">
                              {chartError}
                            </div>
                          ) : chart ? (
                            <div className="mt-3 flex flex-1 flex-col gap-3 overflow-y-auto pr-1 text-[11px] text-slate-300">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                                  <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">SWO signed</p>
                                  <p className="mt-1 text-sm font-semibold text-white">{chart.summary.signed_swo_count}/{chart.summary.total_orders}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                                  <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Paid</p>
                                  <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(chart.summary.paid_amount_total)}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                                  <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Denials</p>
                                  <p className="mt-1 text-sm font-semibold text-white">{chart.summary.denials_count}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                                  <p className="text-[9px] uppercase tracking-[0.18em] text-slate-500">EOBs</p>
                                  <p className="mt-1 text-sm font-semibold text-white">{chart.summary.eobs_count}</p>
                                </div>
                              </div>

                              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Orders in chart</p>
                                <div className="mt-2 grid gap-2">
                                  {chart.orders.slice(0, 3).map((order) => (
                                    <div key={order.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
                                      <p className="font-semibold text-white">
                                        {order.id.slice(0, 8).toUpperCase()} · {order.status || "unknown"}
                                      </p>
                                      <p className="mt-1 text-slate-400">
                                        {(order.hcpcs_codes || []).join(", ") || "No HCPCS"} · Billing {order.billing_status || "pending"}
                                      </p>
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        <DocumentPill label="SWO" document={order.primary_documents?.swo} />
                                        <DocumentPill label="CMS1500" document={order.primary_documents?.cms1500} />
                                        <DocumentPill label="POD" document={order.primary_documents?.pod} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Payments</p>
                                  <p className="mt-2 text-sm font-semibold text-white">{chart.summary.payments_count} recorded</p>
                                  <p className="text-slate-400">
                                    {chart.payments[0]?.paid_amount ? formatCurrency(chart.payments[0].paid_amount) : "No payment yet"}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Denials / Appeals</p>
                                  <p className="mt-2 text-sm font-semibold text-white">
                                    {chart.summary.denials_count} / {chart.summary.appeals_count}
                                  </p>
                                  <p className="text-slate-400">
                                    {chart.denials[0]?.denial_category || chart.appeals[0]?.status || "No active dispute"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <SummaryPill label="Orders" value={String(chart.summary.total_orders)} />
                                <SummaryPill label="Appeals" value={String(chart.summary.appeals_count)} />
                                <SummaryPill label="EOBs" value={String(chart.summary.eobs_count)} />
                                <SummaryPill label="Denied" value={formatCurrency(chart.summary.denied_amount_total)} />
                              </div>

                              {chart.pod_delivery_guidance ? (
                                <div className="shrink-0">
                                  <PodDeliveryGuidancePanel compact data={chart.pod_delivery_guidance} />
                                </div>
                              ) : null}

                              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                                <div className="flex gap-2">
                                  <button
                                    className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-slate-300 transition hover:border-accent-blue/40 hover:text-white"
                                    onClick={() => refreshPatientChart(card.patientId)}
                                    type="button"
                                  >
                                    Refresh
                                  </button>
                                  <button
                                    className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-slate-300 transition hover:border-accent-blue/40 hover:text-white"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      void handleFlip(card)
                                    }}
                                    type="button"
                                  >
                                    Return
                                  </button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-500">Patient lifecycle</span>
                                  {card.href && (
                                    <Link
                                      className="rounded-full border border-accent-blue/30 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-accent-blue transition hover:border-accent-blue hover:text-white"
                                      href={card.href}
                                    >
                                      Open chart
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-4 flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-black/10 text-xs text-slate-500">
                              No chart data available.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              <button
                className="rounded-md border border-dashed border-[rgba(40,90,180,0.25)] bg-transparent px-2.5 py-2 text-center text-[11px] text-[#4a6a90] transition-colors hover:border-accent-blue hover:text-accent-blue"
                type="button"
              >
                + Add card
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
