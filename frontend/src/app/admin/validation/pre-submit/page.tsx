"use client"

import { useCallback, useMemo, useState } from "react"

type PreSubmitValidationResult = {
  status: "PASS" | "BLOCK" | "REVIEW"
  missingRequirements: string[]
  violations: string[]
  warnings: string[]
  recommendedActions: string[]
  explanation: string[]
  validationResultId?: string
}

const API = "/api/validation/pre-submit"

export default function PreSubmitValidationPage() {
  const [packetId, setPacketId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PreSubmitValidationResult | null>(null)

  const statusColor = useMemo(() => {
    if (!result) return {}
    if (result.status === "PASS") return { border: "border-emerald-700", bg: "bg-emerald-950/30", text: "text-emerald-200" }
    if (result.status === "BLOCK")
      return { border: "border-rose-700", bg: "bg-rose-950/30", text: "text-rose-200" }
    return { border: "border-amber-700", bg: "bg-amber-950/30", text: "text-amber-200" }
  }, [result])

  const runValidation = useCallback(async () => {
    if (!packetId.trim()) {
      setError("packetId is required")
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packetId: packetId.trim() }),
      })

      const json = (await res.json().catch(() => ({}))) as { error?: string; status?: string; success?: boolean } & Record<
        string,
        unknown
      >

      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
        setResult(null)
        return
      }

      // Backend returns: { success: true, ...validationResult }
      setResult((json as any).result ? (json as any).result : (json as any))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [packetId])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-[11px] uppercase tracking-[0.32em] text-[#8fb5de]">Admin / Validation</p>
        <h1 className="font-display text-3xl uppercase tracking-[0.1em] text-white">Pre-submission requirement validator</h1>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <section className="glass-panel rounded-[20px] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-slate-300/95">Packet ID</span>
            <input
              value={packetId}
              onChange={(e) => setPacketId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-accent-blue/40 text-sm"
              placeholder="cuid packet id"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={loading}
              onClick={() => void runValidation()}
              className="w-full rounded-[16px] border border-accent-blue/30 bg-accent-blue/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-blue/25 disabled:opacity-50"
            >
              {loading ? "Validating…" : "Run pre-submit validation"}
            </button>
          </div>
        </div>
      </section>

      {result ? (
        <section className={`rounded-lg border p-4 ${statusColor.border} ${statusColor.bg}`}>
          <div className={`text-sm font-medium ${statusColor.text}`}>
            Status: <span className="font-semibold">{result.status}</span>
            {result.validationResultId ? <span className="ml-3 text-xs text-slate-300">ID: {result.validationResultId}</span> : null}
          </div>

          {result.missingRequirements?.length ? (
            <div className="mt-4">
              <h2 className="text-sm font-semibold">Missing requirements</h2>
              <ul className="mt-2 space-y-2">
                {result.missingRequirements.map((m, idx) => (
                  <li key={`${m}-${idx}`} className="rounded border border-slate-700 bg-slate-950/30 p-3 text-sm">
                    <div className="font-medium">{m}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.violations?.length ? (
            <div className="mt-4">
              <h2 className="text-sm font-semibold">Violations</h2>
              <ul className="mt-2 space-y-2">
                {result.violations.map((v, idx) => (
                  <li key={`${idx}`} className="rounded border border-slate-700 bg-slate-950/30 p-3 text-sm">
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.warnings?.length ? (
            <div className="mt-4">
              <h2 className="text-sm font-semibold">Warnings</h2>
              <ul className="mt-2 space-y-2">
                {result.warnings.map((w, idx) => (
                  <li key={idx} className="rounded border border-slate-700 bg-slate-950/30 p-3 text-sm">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.recommendedActions?.length ? (
            <div className="mt-4">
              <h2 className="text-sm font-semibold">Remediation suggestions</h2>
              <ul className="mt-2 space-y-2">
                {result.recommendedActions.map((a, idx) => (
                  <li key={idx} className="rounded border border-slate-700 bg-slate-950/30 p-3 text-sm">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.explanation?.length ? (
            <div className="mt-4">
              <h2 className="text-sm font-semibold">Explanation</h2>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-700 bg-black/30 p-3 text-xs text-slate-200">
                {result.explanation.join("\n")}
              </pre>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

