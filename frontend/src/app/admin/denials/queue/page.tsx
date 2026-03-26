"use client"

import { useCallback, useState } from "react"
import Link from "next/link"

type QueueItem = {
  denialEvent: {
    id: string
    payerId: string
    denialCode?: string | null
    denialReasonText?: string
    denialCategory?: string | null
    caseId?: string | null
    packetId?: string | null
    createdAt?: string
  }
  latestClassification?: {
    category: string
    recoveryType: string
    confidence?: number | null
    requiredFixes?: string[]
    requiredAttachments?: string[]
    explanation?: string[]
  } | null
  latestAppealPacket?: {
    id: string
    status: string
    letterText?: string
    attachmentChecklist?: string[]
  } | null
}

const API = "/api/denials/queue"

export default function DenialsQueuePage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])

  const loadQueue = useCallback(async () => {
    setLoading(true)
    setError(null)
    setQueue([])
    try {
      const res = await fetch(API, { method: "GET" })
      const json = (await res.json().catch(() => ({}))) as any
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
        return
      }
      setQueue(Array.isArray(json?.queue) ? (json.queue as QueueItem[]) : [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="glass-panel-strong cockpit-sheen hud-outline rounded-[32px] p-5 sm:p-6">
        <p className="mb-3 inline-flex items-center rounded-full border border-[rgba(142,197,255,0.35)] bg-[rgba(118,243,255,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#a8dcff]">
          Denials
        </p>
        <h1 className="font-display text-4xl uppercase tracking-[0.1em] text-white sm:text-5xl">Denial queue</h1>
      </header>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <section className="glass-panel rounded-[20px] p-4">
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadQueue()}
          className="w-full rounded-[16px] border border-accent-blue/30 bg-accent-blue/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-blue/25 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh denials"}
        </button>
      </section>

      {queue.length ? (
        <section className="space-y-3">
          {queue.map((item) => {
            const event = item.denialEvent
            const cls = item.latestClassification
            const appeal = item.latestAppealPacket

            return (
              <div
                key={event.id}
                className="glass-panel rounded-[20px] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">
                      Denial {event.id} ({event.payerId})
                    </div>
                    {event.denialCode ? (
                      <div className="mt-1 text-xs text-slate-300">Code: {event.denialCode}</div>
                    ) : null}
                    {cls?.category ? (
                      <div className="mt-2 text-xs text-slate-300">
                        Classification: {cls.category} / {cls.recoveryType}{" "}
                        {typeof cls.confidence === "number" ? `(${cls.confidence.toFixed(2)})` : null}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-400">Unclassified</div>
                    )}
                    {appeal ? (
                      <div className="mt-2 text-xs text-slate-300">Appeal draft: {appeal.status}</div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-400">No appeal draft yet</div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/admin/denials/${encodeURIComponent(event.id)}`}
                      className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-accent-blue/40 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      View details
                    </Link>
                    {appeal ? (
                      <Link
                        href={`/admin/appeals/${encodeURIComponent(appeal.id)}?denialEventId=${encodeURIComponent(
                          event.id,
                        )}`}
                        className="rounded-full border border-accent-blue/30 bg-accent-blue/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent-blue/25"
                      >
                        Open appeal draft
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      ) : null}
    </div>
  )
}

