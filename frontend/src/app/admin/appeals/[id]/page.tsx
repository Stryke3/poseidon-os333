"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"

type DetailsResponse = {
  denialEvent?: any
  classification?: any
  appeal?: any
}

export default function AppealPreviewPage() {
  const params = useParams()
  const appealPacketId = typeof params?.id === "string" ? params.id : ""
  const searchParams = useSearchParams()
  const denialEventId = searchParams.get("denialEventId") ?? ""

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DetailsResponse | null>(null)

  const apiUrl = useMemo(() => {
    return denialEventId ? `/api/denials/${encodeURIComponent(denialEventId)}` : ""
  }, [denialEventId])

  useEffect(() => {
    if (!apiUrl) return

    const run = async () => {
      setLoading(true)
      setError(null)
      setData(null)
      try {
        const res = await fetch(apiUrl, { method: "GET" })
        const json = (await res.json().catch(() => ({}))) as any
        if (!res.ok) {
          setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
          return
        }
        setData({ denialEvent: json?.denialEvent, classification: json?.classification, appeal: json?.appeal })
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Request failed")
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [apiUrl])

  const appeal = data?.appeal
  const denialEvent = data?.denialEvent

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-[11px] uppercase tracking-[0.32em] text-[#8fb5de]">Admin / Appeals</p>
        <h1 className="font-display text-3xl uppercase tracking-[0.1em] text-white">Appeal draft preview</h1>
      </div>

      {!denialEventId ? (
        <p className="text-sm text-rose-400">
          Missing `denialEventId` query param. This page expects a link from the denial details screen.
        </p>
      ) : null}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-300">Loading…</p> : null}

      {!loading && denialEvent && appeal ? (
        <>
          <section className="glass-panel rounded-[20px] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Appeal packet</div>
                <div className="mt-1 text-sm text-slate-300">Appeal ID: {appeal.id}</div>
                <div className="mt-1 text-sm text-slate-300">Status: {appeal.status}</div>
              </div>
              {denialEvent?.id ? (
                <Link
                  href={`/admin/denials/${encodeURIComponent(denialEvent.id)}`}
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-accent-blue/40 text-xs text-slate-200 hover:bg-slate-800"
                >
                  ← Back to denial
                </Link>
              ) : null}
            </div>

            {appealPacketId && appeal.id !== appealPacketId ? (
              <p className="mt-3 text-sm text-amber-300">
                Warning: the loaded latest appeal draft doesn’t match the requested `id`.
              </p>
            ) : null}
          </section>

          <section className="glass-panel rounded-[20px] p-4">
            <div className="text-sm font-semibold">Letter draft</div>
            {appeal.letterText ? (
              <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border border-slate-700 bg-black/30 p-3 text-xs text-slate-200">
                {appeal.letterText}
              </pre>
            ) : (
              <p className="mt-2 text-sm text-slate-300/95">No letter draft found.</p>
            )}
          </section>

          <section className="glass-panel rounded-[20px] p-4">
            <div className="text-sm font-semibold">Rebuttal points</div>
            {Array.isArray(appeal.rebuttalPoints) && appeal.rebuttalPoints.length ? (
              <ul className="mt-3 space-y-2">
                {appeal.rebuttalPoints.map((x: string, i: number) => (
                  <li key={`${i}-${x}`} className="rounded border border-slate-700 bg-slate-950/30 p-3 text-sm">
                    {x}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-300/95">No rebuttal points found.</p>
            )}
          </section>

          <section className="glass-panel rounded-[20px] p-4">
            <div className="text-sm font-semibold">Attachment checklist</div>
            {Array.isArray(appeal.attachmentChecklist) && appeal.attachmentChecklist.length ? (
              <ul className="mt-3 space-y-2">
                {appeal.attachmentChecklist.map((x: string, i: number) => (
                  <li key={`${i}-${x}`} className="rounded border border-slate-700 bg-slate-950/30 p-3 text-sm">
                    {x}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-300/95">No checklist found.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

