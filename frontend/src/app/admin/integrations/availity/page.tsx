"use client"

import Link from "next/link"
import { useCallback, useState } from "react"

const API = "/api/integrations/availity"

export default function AvailityAdminPage() {
  const [health, setHealth] = useState<unknown>(null)
  const [result, setResult] = useState<unknown>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [eligLoading, setEligLoading] = useState(false)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [eligError, setEligError] = useState<string | null>(null)

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    memberId: "",
    payerId: "",
  })

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true)
    setHealthError(null)
    try {
      const res = await fetch(`${API}/health`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setHealthError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      setHealth(json)
    } catch (e: unknown) {
      setHealthError(e instanceof Error ? e.message : "Health check failed")
      setHealth(null)
    } finally {
      setHealthLoading(false)
    }
  }, [])

  const submitEligibility = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setEligLoading(true)
      setEligError(null)
      setResult(null)
      try {
        const res = await fetch(`${API}/eligibility`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payerId: form.payerId,
            memberId: form.memberId,
            patient: {
              firstName: form.firstName,
              lastName: form.lastName,
              dob: form.dob,
            },
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setEligError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
        }
        setResult(json)
      } catch (e: unknown) {
        setEligError(e instanceof Error ? e.message : "Eligibility request failed")
      } finally {
        setEligLoading(false)
      }
    },
    [form],
  )

  const [paLoading, setPaLoading] = useState(false)
  const [paForm, setPaForm] = useState({
    caseId: "",
    firstName: "",
    lastName: "",
    dob: "",
    memberId: "",
    payerId: "",
    diagnosisCode: "",
    procedureCode: "",
  })
  const [paResult, setPaResult] = useState<unknown>(null)
  const [paError, setPaError] = useState<string | null>(null)

  const submitPriorAuth = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setPaLoading(true)
      setPaError(null)
      setPaResult(null)
      try {
        const payload: Record<string, unknown> = {
          payer: { id: paForm.payerId },
          subscriber: {
            firstName: paForm.firstName,
            lastName: paForm.lastName,
            birthDate: paForm.dob,
            memberId: paForm.memberId,
          },
          diagnosis: { code: paForm.diagnosisCode },
          procedure: { code: paForm.procedureCode },
          serviceType: "30",
        }
        const body: { caseId?: string; payload: Record<string, unknown> } = {
          payload,
        }
        if (paForm.caseId.trim()) body.caseId = paForm.caseId.trim()

        const res = await fetch(`${API}/prior-auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setPaError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
        }
        setPaResult(json)
      } catch (e: unknown) {
        setPaError(e instanceof Error ? e.message : "Prior auth request failed")
      } finally {
        setPaLoading(false)
      }
    },
    [paForm],
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="glass-panel-strong cockpit-sheen hud-outline rounded-[32px] p-5 sm:p-6">
          <p className="mb-3 inline-flex items-center rounded-full border border-[rgba(142,197,255,0.35)] bg-[rgba(118,243,255,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#a8dcff]">
            Integrations
          </p>
          <h1 className="font-display text-4xl uppercase tracking-[0.1em] text-white sm:text-5xl">Availity</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300/95">
            Proxied via Next.js <code className="text-slate-400">/api/integrations/availity/*</code>.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/admin/integrations/availity/packets" className="text-accent-blue hover:underline">
              Packet Generator
            </Link>
            <Link href="/admin/intelligence/payer" className="text-accent-blue hover:underline">
              Payer Intelligence
            </Link>
            <Link href="/admin/playbooks" className="text-accent-blue hover:underline">
              Payer Playbooks
            </Link>
          </div>
        </header>

        <Section title="Health Check">
          <button
            type="button"
            onClick={runHealthCheck}
            disabled={healthLoading}
            className="rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-5 py-2.5 text-sm font-semibold text-accent-blue transition hover:bg-accent-blue/20 disabled:opacity-50"
          >
            {healthLoading ? "Working\u2026" : "Run Health Check"}
          </button>
          {healthError && <ErrorBanner message={healthError} />}
          {health != null && <JsonPanel data={health} />}
        </Section>

        <Section title="Eligibility Check">
          <form onSubmit={submitEligibility} className="grid gap-4 sm:grid-cols-2">
            <Input
              label="First Name"
              value={form.firstName}
              onChange={(v) => setForm((p) => ({ ...p, firstName: v }))}
            />
            <Input
              label="Last Name"
              value={form.lastName}
              onChange={(v) => setForm((p) => ({ ...p, lastName: v }))}
            />
            <Input
              label="DOB (YYYY-MM-DD)"
              value={form.dob}
              onChange={(v) => setForm((p) => ({ ...p, dob: v }))}
              placeholder="1990-01-15"
            />
            <Input
              label="Member ID"
              value={form.memberId}
              onChange={(v) => setForm((p) => ({ ...p, memberId: v }))}
            />
            <Input
              label="Payer ID"
              value={form.payerId}
              onChange={(v) => setForm((p) => ({ ...p, payerId: v }))}
            />
            <div className="flex items-end sm:col-span-2">
              <button
                type="submit"
                disabled={eligLoading}
                className="rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-6 py-2.5 text-sm font-semibold text-accent-blue transition hover:bg-accent-blue/20 disabled:opacity-50"
              >
                {eligLoading ? "Submitting\u2026" : "Submit Eligibility"}
              </button>
            </div>
          </form>
          {eligError && <ErrorBanner message={eligError} />}
          {result != null && <JsonPanel data={result} />}
        </Section>

        <Section title="Prior Authorization">
          <form onSubmit={submitPriorAuth} className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Case ID (optional)"
              value={paForm.caseId}
              onChange={(v) => setPaForm((p) => ({ ...p, caseId: v }))}
              placeholder="Existing case cuid"
            />
            <div className="hidden sm:block" />
            <Input
              label="First Name"
              value={paForm.firstName}
              onChange={(v) => setPaForm((p) => ({ ...p, firstName: v }))}
            />
            <Input
              label="Last Name"
              value={paForm.lastName}
              onChange={(v) => setPaForm((p) => ({ ...p, lastName: v }))}
            />
            <Input
              label="DOB (YYYY-MM-DD)"
              value={paForm.dob}
              onChange={(v) => setPaForm((p) => ({ ...p, dob: v }))}
              placeholder="1990-01-15"
            />
            <Input
              label="Member ID"
              value={paForm.memberId}
              onChange={(v) => setPaForm((p) => ({ ...p, memberId: v }))}
            />
            <Input
              label="Payer ID"
              value={paForm.payerId}
              onChange={(v) => setPaForm((p) => ({ ...p, payerId: v }))}
            />
            <Input
              label="Diagnosis Code"
              value={paForm.diagnosisCode}
              onChange={(v) => setPaForm((p) => ({ ...p, diagnosisCode: v }))}
              placeholder="M17.11"
            />
            <Input
              label="Procedure Code"
              value={paForm.procedureCode}
              onChange={(v) => setPaForm((p) => ({ ...p, procedureCode: v }))}
              placeholder="L1832"
            />
            <div className="flex items-end sm:col-span-2">
              <button
                type="submit"
                disabled={paLoading}
                className="rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-6 py-2.5 text-sm font-semibold text-accent-blue transition hover:bg-accent-blue/20 disabled:opacity-50"
              >
                {paLoading ? "Submitting\u2026" : "Submit Prior Auth"}
              </button>
            </div>
          </form>
          {paError && <ErrorBanner message={paError} />}
          {paResult != null && <JsonPanel data={paResult} />}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass-panel rounded-[28px] p-5">
      <h2 className="mb-4 text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
  )
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-accent-blue/50 focus:outline-none"
      />
    </label>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-xl border border-accent-red/30 bg-accent-red/5 p-3 text-sm text-accent-red">
      {message}
    </div>
  )
}

function JsonPanel({ data }: { data: unknown }) {
  return (
    <pre className="mt-4 max-h-96 overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-slate-300">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}
