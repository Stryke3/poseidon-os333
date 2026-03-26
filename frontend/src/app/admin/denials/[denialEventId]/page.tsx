"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

type DenialsDetailsResponse = {
  denialEvent?: any
  classification?: any
  appeal?: any
}

export default function DenialDetailsPage() {
  const params = useParams()
  const denialEventId = typeof params?.denialEventId === "string" ? params.denialEventId : ""

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DenialsDetailsResponse | null>(null)

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

  const denialEvent = data?.denialEvent
  const classification = data?.classification
  const appeal = data?.appeal

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-[11px] uppercase tracking-[0.32em] text-[#8fb5de]">Admin / Denials</p>
        <h1 className="font-display text-3xl uppercase tracking-[0.1em] text-white">Denial details</h1>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {loading ? <p className="text-sm text-slate-300">Loading…</p> : null}

      {!loading && denialEvent ? (
        <>
          <section className="glass-panel rounded-[20px] p-4">
            <div className="text-sm font-semibold">Denial event</div>
            <div className="mt-2 text-sm text-slate-300">ID: {denialEvent.id}</div>
            <div className="mt-1 text-sm text-slate-300">Payer: {denialEvent.payerId}</div>
            {denialEvent.planName ? <div className="mt-1 text-sm text-slate-300">Plan: {denialEvent.planName}</div> : null}
            {denialEvent.authId ? <div className="mt-1 text-sm text-slate-300">Auth: {denialEvent.authId}</div> : null}
            {denialEvent.denialCode ? <div className="mt-1 text-sm text-slate-300">Denial code: {denialEvent.denialCode}</div> : null}
            {denialEvent.denialReasonText ? <div className="mt-1 text-sm text-slate-300">Reason: {denialEvent.denialReasonText}</div> : null}
            {denialEvent.denialCategory ? <div className="mt-1 text-sm text-slate-300">Stored category: {denialEvent.denialCategory}</div> : null}
          </section>

          <section className="glass-panel rounded-[20px] p-4">
            <div className="text-sm font-semibold">Classification snapshot</div>
            {classification ? (
              <>
                <div className="mt-2 text-sm text-slate-300">
                  Category: {classification.category} / {classification.recoveryType}
                  {typeof classification.confidence === "number" ? ` (${classification.confidence.toFixed(2)})` : null}
                </div>

                {classification.requiredFixes?.length ? (
                  <div className="mt-3">
                    <div className="text-sm font-semibold">Required fixes</div>
                    <ul className="mt-2 space-y-2">
                      {classification.requiredFixes.map((x: string, i: number) => (
                        <li key={`${i}-${x}`} className="rounded border border-slate-700 bg-slate-950/30 p-3 text-sm">
                          {x}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {classification.requiredAttachments?.length ? (
                  <div className="mt-3">
                    <div className="text-sm font-semibold">Required attachments</div>
                    <ul className="mt-2 space-y-2">
                      {classification.requiredAttachments.map((x: string, i: number) => (
                        <li key={`${i}-${x}`} className="rounded border border-slate-700 bg-slate-950/30 p-3 text-sm">
                          {x}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {classification.escalationSteps?.length ? (
                  <div className="mt-3">
                    <div className="text-sm font-semibold">Escalation steps</div>
                    <ul className="mt-2 space-y-2">
                      {classification.escalationSteps.map((x: string, i: number) => (
                        <li key={`${i}-${x}`} className="rounded border border-slate-700 bg-slate-950/30 p-3 text-sm">
                          {x}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {classification.explanation?.length ? (
                  <div className="mt-3">
                    <div className="text-sm font-semibold">Explanation</div>
                    <pre className="mt-2 max-h-64 overflow-auto rounded border border-slate-700 bg-black/30 p-3 text-xs text-slate-200 whitespace-pre-wrap">
                      {classification.explanation.join("\n")}
                    </pre>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-2 text-sm text-slate-300/95">No classification snapshot yet.</div>
            )}
          </section>

          <section className="glass-panel rounded-[20px] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Appeal draft</div>
              {appeal?.id ? (
                <Link
                  href={`/admin/appeals/${encodeURIComponent(appeal.id)}?denialEventId=${encodeURIComponent(denialEvent.id)}`}
                  className="rounded-full border border-accent-blue/30 bg-accent-blue/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent-blue/25"
                >
                  Open full draft
                </Link>
              ) : null}
            </div>
            {appeal ? (
              <div className="mt-2">
                <div className="text-sm text-slate-300">Status: {appeal.status}</div>
                {appeal.attachmentChecklist?.length ? (
                  <div className="mt-3">
                    <div className="text-sm font-semibold">Attachment checklist</div>
                    <ul className="mt-2 space-y-2">
                      {appeal.attachmentChecklist.map((x: string, i: number) => (
                        <li key={`${i}-${x}`} className="rounded border border-slate-700 bg-slate-950/30 p-3 text-sm">
                          {x}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-300/95">No appeal draft yet.</div>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}

