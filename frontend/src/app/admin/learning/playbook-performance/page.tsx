"use client"

import { useCallback, useState } from "react"
import Link from "next/link"

const API = "/api/learning"

export default function LearningPlaybookPerformancePage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payerId, setPayerId] = useState("")
  const [playbookId, setPlaybookId] = useState("")
  const [dataJson, setDataJson] = useState<unknown>(null)
  const [suggestionsJson, setSuggestionsJson] = useState<unknown>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (payerId.trim()) qs.set("payerId", payerId.trim())
      if (playbookId.trim()) qs.set("playbookId", playbookId.trim())
      const res = await fetch(`${API}/playbook-performance?${qs.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setDataJson(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [payerId, playbookId])

  const loadSuggestions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ status: "DRAFT" })
      if (payerId.trim()) qs.set("payerId", payerId.trim())
      const res = await fetch(`${API}/learned-rule-suggestions?${qs.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setSuggestionsJson(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [payerId])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/learning" className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400 transition hover:border-accent-blue/30 hover:text-white">
        ← Learning hub
      </Link>
      <h1 className="font-display text-3xl uppercase tracking-[0.1em] text-white">Playbook performance</h1>
      <p className="text-sm text-slate-300/95">
        Metrics from <code className="text-slate-300">GET /playbook-performance</code>; draft suggestions from{" "}
        <code className="text-slate-300">GET /learned-rule-suggestions</code>.
      </p>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <section className="flex flex-wrap items-end gap-3 glass-panel rounded-[20px] p-4">
        <div>
          <label className="block text-xs text-slate-500">Payer ID</label>
          <input
            className="w-48 rounded-lg border border-white/10 bg-black/20 px-2 py-1 outline-none focus:border-accent-blue/40 text-sm"
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Playbook ID</label>
          <input
            className="w-56 rounded-lg border border-white/10 bg-black/20 px-2 py-1 outline-none focus:border-accent-blue/40 text-sm"
            value={playbookId}
            onChange={(e) => setPlaybookId(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm hover:bg-indigo-500 disabled:opacity-50"
        >
          Load metrics
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadSuggestions()}
          className="rounded border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          Draft learned suggestions
        </button>
      </section>

      {dataJson ? (
        <pre className="max-h-[480px] overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
          {JSON.stringify(dataJson, null, 2)}
        </pre>
      ) : null}
      {suggestionsJson ? (
        <pre className="max-h-[360px] overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
          {JSON.stringify(suggestionsJson, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}
