"use client"

import Link from "next/link"
import { useCallback, useState } from "react"

const API = "/api/playbooks"

const GOVERNANCE_HREF = "/admin/governance"

export default function PayerPlaybooksAdminPage() {
  const [payerId, setPayerId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listJson, setListJson] = useState<unknown>(null)
  const [matchJson, setMatchJson] = useState<unknown>(null)

  const [createJson, setCreateJson] = useState(`{
  "payerId": "EXAMPLE_PAYER",
  "deviceCategory": "Knee orthosis",
  "strategy": {
    "requiredDocuments": ["Signed SWO", "Chart notes supporting medical necessity"],
    "timing": "REVIEW"
  },
  "documentRules": {
    "lmnAdditions": [
      "Attestation: this LMN reflects user-entered facts from the case record only."
    ],
    "clinicalAdditions": [
      "Payer playbook reminder: ensure clinical summary aligns with user-supplied lines only."
    ]
  },
  "escalationRules": {
    "onDenial": ["If denied for medical necessity, request written rationale and route to appeals."],
    "peerToPeer": true
  }
}`)

  const loadList = useCallback(async () => {
    if (!payerId.trim()) {
      setError("Payer ID required")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/${encodeURIComponent(payerId.trim())}`)
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

  const runMatch = useCallback(async () => {
    if (!payerId.trim()) {
      setError("Payer ID required")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({
        payerId: payerId.trim(),
        deviceCategory: "Knee orthosis",
        hcpcsCode: "L1832",
        diagnosisCodes: "M17.11",
      })
      const res = await fetch(`${API}/match?${qs.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setMatchJson(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [payerId])

  const createPlaybook = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const body = JSON.parse(createJson) as unknown
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setListJson(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invalid JSON or request failed")
    } finally {
      setLoading(false)
    }
  }, [createJson])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="glass-panel-strong cockpit-sheen hud-outline rounded-[32px] p-5 sm:p-6">
          <p className="mb-3 inline-flex items-center rounded-full border border-[rgba(142,197,255,0.35)] bg-[rgba(118,243,255,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#a8dcff]">
            Playbooks
          </p>
          <h1 className="font-display text-4xl uppercase tracking-[0.1em] text-white sm:text-5xl">Payer playbook engine</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300/95">
            Versioned, deterministic payer strategies. Matching and execution are fully traceable — inspect execution rows
            and document <code className="text-slate-400">_payerPlaybook</code> provenance on authored documents.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href={GOVERNANCE_HREF} className="text-accent-blue hover:underline">
              Learning &amp; governance
            </Link>
            <Link href="/admin/integrations/availity" className="text-accent-blue hover:underline">
              Availity integration
            </Link>
          </div>
        </header>

        <section className="glass-panel rounded-[28px] p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">List / match</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-400">Payer ID</span>
              <input
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-accent-blue/50 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={loadList}
              disabled={loading}
              className="rounded-xl border border-white/20 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
            >
              GET playbooks
            </button>
            <button
              type="button"
              onClick={runMatch}
              disabled={loading}
              className="rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-5 py-2.5 text-sm font-semibold text-accent-blue hover:bg-accent-blue/20 disabled:opacity-50"
            >
              Preview match
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Match preview uses sample device/HCPCS/dx — adjust query in code or extend this form as needed.
          </p>
        </section>

        <section className="glass-panel rounded-[28px] p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Create playbook (JSON)</h2>
          <textarea
            value={createJson}
            onChange={(e) => setCreateJson(e.target.value)}
            rows={18}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-slate-200 focus:border-accent-blue/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={createPlaybook}
            disabled={loading}
            className="mt-4 rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-6 py-2.5 text-sm font-semibold text-accent-blue hover:bg-accent-blue/20 disabled:opacity-50"
          >
            POST /api/playbooks
          </button>
        </section>

        {error && (
          <div className="rounded-xl border border-accent-red/30 bg-accent-red/5 p-3 text-sm text-accent-red">{error}</div>
        )}

        {matchJson != null && (
          <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-slate-300">
            {JSON.stringify(matchJson, null, 2)}
          </pre>
        )}

        {listJson != null && (
          <pre className="max-h-[28rem] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-slate-300">
            {JSON.stringify(listJson, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
