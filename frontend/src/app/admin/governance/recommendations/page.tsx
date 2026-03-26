"use client"

import { useCallback, useState } from "react"
import Link from "next/link"

const API = "/api/governance"

export default function GovernanceRecommendationsPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listJson, setListJson] = useState<unknown>(null)
  const [evalJson, setEvalJson] = useState<unknown>(null)
  const [periodDays, setPeriodDays] = useState(90)
  const [payerId, setPayerId] = useState("")
  const [recommendationId, setRecommendationId] = useState("")
  const [decisionReason, setDecisionReason] = useState("")
  const [draftsJson, setDraftsJson] = useState<unknown>(null)

  const loadQueue = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/recommendations?status=PENDING`)
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
  }, [])

  const runLearning = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/learning/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodDays,
          ...(payerId.trim() ? { payerId: payerId.trim() } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setEvalJson(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [periodDays, payerId])

  const loadDrafts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = payerId.trim() ? `?status=DRAFT&payerId=${encodeURIComponent(payerId.trim())}` : "?status=DRAFT"
      const res = await fetch(`${API}/drafts${qs}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setDraftsJson(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [payerId])

  const createDraft = useCallback(async () => {
    const id = recommendationId.trim()
    if (!id) {
      setError("Recommendation ID required to create draft")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/recommendations/${encodeURIComponent(id)}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setEvalJson(json)
      await loadDrafts()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [recommendationId, loadDrafts])

  const decide = useCallback(
    async (verb: "approve" | "reject") => {
      const id = recommendationId.trim()
      if (!id) {
        setError("Recommendation ID required")
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API}/recommendations/${encodeURIComponent(id)}/${verb}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: decisionReason.trim() || undefined }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
        }
        setEvalJson(json)
        await loadQueue()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Request failed")
      } finally {
        setLoading(false)
      }
    },
    [recommendationId, decisionReason, loadQueue],
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/governance" className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400 transition hover:border-accent-blue/30 hover:text-white">
        ← Governance hub
      </Link>
      <h1 className="font-display text-3xl uppercase tracking-[0.1em] text-white">Recommendation queue</h1>
      <p className="text-sm text-slate-300/95">
        Approvals are audit-logged only — they do not edit active playbooks or payer rules automatically. Create a{" "}
        <strong className="text-slate-300">draft artifact</strong> to capture playbook revisions or payer-rule change
        notes tied to evidence (still no auto-apply).
      </p>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <section className="flex flex-wrap items-end gap-3 glass-panel rounded-[20px] p-4">
        <div>
          <label className="block text-xs text-slate-500">Period (days)</label>
          <input
            type="number"
            className="w-24 rounded-lg border border-white/10 bg-black/20 px-2 py-1 outline-none focus:border-accent-blue/40 text-sm"
            value={periodDays}
            min={7}
            max={730}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Payer filter (optional)</label>
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
          onClick={() => void runLearning()}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm hover:bg-indigo-500 disabled:opacity-50"
        >
          Run learning evaluation
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadQueue()}
          className="rounded border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50"
        >
            Refresh queue
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadDrafts()}
          className="rounded border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          List draft artifacts
        </button>
      </section>

      <section className="space-y-2 glass-panel rounded-[20px] p-4">
        <h2 className="text-sm font-medium text-slate-300">Decision</h2>
        <input
          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-accent-blue/40 text-sm"
          value={recommendationId}
          onChange={(e) => setRecommendationId(e.target.value)}
          placeholder="Recommendation ID (cuid)"
        />
        <input
          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-accent-blue/40 text-sm"
          value={decisionReason}
          onChange={(e) => setDecisionReason(e.target.value)}
          placeholder="Optional reason (audit)"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void decide("approve")}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm hover:bg-emerald-600 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void decide("reject")}
            className="rounded bg-rose-900/80 px-3 py-1.5 text-sm hover:bg-rose-800 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void createDraft()}
            className="rounded border border-amber-600/60 px-3 py-1.5 text-sm text-amber-100/90 hover:bg-amber-950/50 disabled:opacity-50"
          >
            Create draft from recommendation
          </button>
        </div>
      </section>

      {evalJson ? (
        <pre className="max-h-[240px] overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
          {JSON.stringify(evalJson, null, 2)}
        </pre>
      ) : null}
      {listJson ? (
        <pre className="max-h-[480px] overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
          {JSON.stringify(listJson, null, 2)}
        </pre>
      ) : null}
      {draftsJson ? (
        <section>
          <h2 className="text-sm font-medium text-slate-300">Draft artifacts</h2>
          <pre className="mt-2 max-h-[360px] overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
            {JSON.stringify(draftsJson, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  )
}
