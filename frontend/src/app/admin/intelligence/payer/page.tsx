"use client"

import Link from "next/link"
import { useState } from "react"

type ScoreForm = {
  payerId: string
  planName: string
  deviceCategory: string
  hcpcsCode: string
  diagnosisCode: string
  hasLmn: boolean
  hasSwo: boolean
  hasClinicals: boolean
}

export default function PayerIntelligencePage() {
  const [form, setForm] = useState<ScoreForm>({
    payerId: "",
    planName: "",
    deviceCategory: "",
    hcpcsCode: "",
    diagnosisCode: "",
    hasLmn: true,
    hasSwo: true,
    hasClinicals: true,
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<unknown>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const body: Record<string, unknown> = {
        payerId: form.payerId.trim(),
        hasLmn: form.hasLmn,
        hasSwo: form.hasSwo,
        hasClinicals: form.hasClinicals,
      }
      if (form.planName.trim()) body.planName = form.planName.trim()
      if (form.deviceCategory.trim()) body.deviceCategory = form.deviceCategory.trim()
      if (form.hcpcsCode.trim()) body.hcpcsCode = form.hcpcsCode.trim()
      if (form.diagnosisCode.trim()) body.diagnosisCode = form.diagnosisCode.trim()

      const res = await fetch("/api/intelligence/payer/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const err =
          json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : `HTTP ${res.status}`
        setError(err)
        return
      }
      setResult(json)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="glass-panel-strong cockpit-sheen hud-outline rounded-[32px] p-5 sm:p-6">
          <p className="mb-3 inline-flex items-center rounded-full border border-[rgba(142,197,255,0.35)] bg-[rgba(118,243,255,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#a8dcff]">
            Intelligence
          </p>
          <h1 className="font-display text-4xl uppercase tracking-[0.1em] text-white sm:text-5xl">Payer Intelligence</h1>
          <p className="mt-4 text-sm text-slate-300/95">
            <Link href="/admin/integrations/availity" className="text-accent-blue hover:underline">
              Availity integration
            </Link>
          </p>
        </header>

        <section className="glass-panel rounded-[28px] p-5">
          <form onSubmit={submit} className="space-y-4">
            <Field
              placeholder="Payer ID *"
              value={form.payerId}
              onChange={(v) => setForm({ ...form, payerId: v })}
              required
            />
            <Field
              placeholder="Plan name"
              value={form.planName}
              onChange={(v) => setForm({ ...form, planName: v })}
            />
            <Field
              placeholder="Device category"
              value={form.deviceCategory}
              onChange={(v) => setForm({ ...form, deviceCategory: v })}
            />
            <Field
              placeholder="HCPCS code"
              value={form.hcpcsCode}
              onChange={(v) => setForm({ ...form, hcpcsCode: v })}
            />
            <Field
              placeholder="Diagnosis code"
              value={form.diagnosisCode}
              onChange={(v) => setForm({ ...form, diagnosisCode: v })}
            />

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="rounded border-white/20 bg-black/40"
                checked={form.hasLmn}
                onChange={(e) => setForm({ ...form, hasLmn: e.target.checked })}
              />
              LMN present
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="rounded border-white/20 bg-black/40"
                checked={form.hasSwo}
                onChange={(e) => setForm({ ...form, hasSwo: e.target.checked })}
              />
              SWO present
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="rounded border-white/20 bg-black/40"
                checked={form.hasClinicals}
                onChange={(e) => setForm({ ...form, hasClinicals: e.target.checked })}
              />
              Clinicals present
            </label>

            <button
              type="submit"
              disabled={loading || !form.payerId.trim()}
              className="rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-6 py-2.5 text-sm font-semibold text-accent-blue transition hover:bg-accent-blue/20 disabled:opacity-50"
            >
              {loading ? "Scoring\u2026" : "Score case"}
            </button>
          </form>

          {error && (
            <p className="mt-4 text-sm text-accent-red" role="alert">
              {error}
            </p>
          )}
        </section>

        {result != null && (
          <pre className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-slate-300">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

function Field({
  placeholder,
  value,
  onChange,
  required,
}: {
  placeholder: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-accent-blue/50 focus:outline-none"
    />
  )
}
