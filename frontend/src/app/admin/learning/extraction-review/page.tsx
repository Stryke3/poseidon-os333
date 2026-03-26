"use client"

import { useCallback, useState } from "react"
import Link from "next/link"

const API = "/api/learning"

export default function LearningExtractionReviewPage() {
  const [payerId, setPayerId] = useState("")
  const [manualId, setManualId] = useState("")
  const [useLlm, setUseLlm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listJson, setListJson] = useState<unknown>(null)
  const [manualJson, setManualJson] = useState<unknown>(null)
  const [extractJson, setExtractJson] = useState<unknown>(null)

  const loadList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = payerId.trim() ? `?payerId=${encodeURIComponent(payerId.trim())}` : ""
      const res = await fetch(`${API}/manuals${qs}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setListJson(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [payerId])

  const loadManual = useCallback(async () => {
    const id = manualId.trim()
    if (!id) {
      setError("Manual ID required")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/manuals/${encodeURIComponent(id)}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
        setManualJson(null)
      } else {
        setManualJson(json)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [manualId])

  const runExtract = useCallback(async () => {
    const id = manualId.trim()
    if (!id) {
      setError("Manual ID required")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/manuals/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualId: id, useLlm }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setExtractJson(json)
      await loadManual()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [manualId, useLlm, loadManual])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/admin/learning" className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400 transition hover:border-accent-blue/30 hover:text-white">
          ← Learning hub
        </Link>
        <Link href="/admin/learning/manuals" className="text-[10px] uppercase tracking-[0.14em] text-slate-500 transition hover:text-white">
          Manuals →
        </Link>
      </div>
      <h1 className="font-display text-3xl uppercase tracking-[0.1em] text-white">Extraction review</h1>
      <p className="text-sm text-slate-300/95">
        Load manual detail, re-run extraction into <code className="text-slate-300">ManualRequirement</code> rows
        (non-APPROVED rows are replaced). Low-confidence and LLM rows stay pending review.
      </p>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <section className="flex flex-wrap items-end gap-3 glass-panel rounded-[20px] p-4">
        <div>
          <label className="block text-xs text-slate-500">Payer filter (list)</label>
          <input
            className="w-48 rounded-lg border border-white/10 bg-black/20 px-2 py-1 outline-none focus:border-accent-blue/40 text-sm"
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
            placeholder="PAYER_X"
          />
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadList()}
          className="rounded border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          List manuals
        </button>
      </section>

      <section className="space-y-2 glass-panel rounded-[20px] p-4">
        <label className="block text-sm text-slate-300/95">Manual ID (cuid)</label>
        <input
          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-accent-blue/40 font-mono text-sm"
          value={manualId}
          onChange={(e) => setManualId(e.target.value)}
          placeholder="clx…"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300/95">
          <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
          Use LLM candidates (requires server env)
        </label>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadManual()}
            className="rounded border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50"
          >
            Load manual + requirements
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runExtract()}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            Re-run extraction (persist)
          </button>
        </div>
      </section>

      {listJson ? (
        <section>
          <h2 className="text-sm font-medium text-slate-300">Manual list</h2>
          <pre className="mt-2 max-h-[280px] overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
            {JSON.stringify(listJson, null, 2)}
          </pre>
        </section>
      ) : null}
      {manualJson ? (
        <section>
          <h2 className="text-sm font-medium text-slate-300">Manual detail</h2>
          <pre className="mt-2 max-h-[480px] overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
            {JSON.stringify(manualJson, null, 2)}
          </pre>
        </section>
      ) : null}
      {extractJson ? (
        <section>
          <h2 className="text-sm font-medium text-slate-300">Last extract response</h2>
          <pre className="mt-2 max-h-[240px] overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
            {JSON.stringify(extractJson, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  )
}
