"use client"

import Link from "next/link"
import { useCallback, useState } from "react"

const API = "/api/integrations/availity/packets"

export default function AvailityPacketsPage() {
  const [caseId, setCaseId] = useState("")
  const [deviceType, setDeviceType] = useState("DME_GENERIC")
  const [diagCode, setDiagCode] = useState("M17.11")
  const [diagDesc, setDiagDesc] = useState("")
  const [deviceCategory, setDeviceCategory] = useState("Knee orthosis")
  const [hcpcs, setHcpcs] = useState("L1832")
  const [physicianName, setPhysicianName] = useState("Dr. Example")
  const [physicianNpi, setPhysicianNpi] = useState("")
  const [summaryLines, setSummaryLines] = useState("Patient ambulates with instability per treating clinician notes on file.")
  const [clinicalJustification, setClinicalJustification] = useState(
    "Instability and pain documented in chart; brace indicated per plan of care.",
  )
  const [limitations, setLimitations] = useState("Difficulty with prolonged standing and stair negotiation.")
  const [failedTreatments, setFailedTreatments] = useState("Conservative measures per medical record.")
  const [orderDate, setOrderDate] = useState("2025-01-15")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [packetId, setPacketId] = useState<string | null>(null)
  const [lastJson, setLastJson] = useState<unknown>(null)
  const [payerScorePreview, setPayerScorePreview] = useState<unknown>(null)

  const clinicalPayload = useCallback(() => {
    const lines = summaryLines
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
    const clinical: Record<string, unknown> = {
      diagnosis: [{ code: diagCode.trim(), ...(diagDesc.trim() ? { description: diagDesc.trim() } : {}) }],
      device: {
        category: deviceCategory.trim(),
        ...(hcpcs.trim() ? { hcpcs: hcpcs.trim() } : {}),
      },
      physician: {
        name: physicianName.trim(),
        ...(physicianNpi.trim() ? { npi: physicianNpi.trim() } : {}),
      },
    }
    if (lines.length) clinical.clinicalSummaryLines = lines
    if (clinicalJustification.trim()) clinical.clinicalJustification = clinicalJustification.trim()
    if (limitations.trim()) clinical.limitations = limitations.trim()
    if (failedTreatments.trim()) clinical.failedTreatments = failedTreatments.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(orderDate.trim())) clinical.orderDate = orderDate.trim()
    return clinical
  }, [
    clinicalJustification,
    diagCode,
    diagDesc,
    deviceCategory,
    failedTreatments,
    hcpcs,
    limitations,
    orderDate,
    physicianName,
    physicianNpi,
    summaryLines,
  ])

  const createPacket = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setLoading(true)
      setError(null)
      setLastJson(null)
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId: caseId.trim(),
            deviceType: deviceType.trim() || "DME_GENERIC",
            clinical: clinicalPayload(),
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
        } else {
          setPacketId(typeof json?.packetId === "string" ? json.packetId : null)
        }
        setLastJson(json)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Request failed")
      } finally {
        setLoading(false)
      }
    },
    [caseId, clinicalPayload, deviceType],
  )

  const loadPacket = useCallback(async () => {
    if (!packetId?.trim()) {
      setError("Enter or create a packet ID first")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ includePayerScore: "true" })
      const res = await fetch(
        `${API}/${encodeURIComponent(packetId.trim())}?${qs.toString()}`,
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setLastJson(json)
      setPayerScorePreview(json && typeof json === "object" && "payerScore" in json ? (json as { payerScore: unknown }).payerScore : null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [packetId])

  const runPayerScore = useCallback(async () => {
    if (!packetId?.trim()) {
      setError("Packet ID required")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${API}/${encodeURIComponent(packetId.trim())}/payer-score`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setPayerScorePreview(json)
      setLastJson(json)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [packetId])

  const regenerate = useCallback(async () => {
    if (!packetId?.trim()) {
      setError("Packet ID required")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/${encodeURIComponent(packetId.trim())}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinical: clinicalPayload() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setLastJson(json)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [clinicalPayload, packetId])

  const submitStub = useCallback(async () => {
    if (!packetId?.trim()) {
      setError("Packet ID required")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        payer: { id: "TEST_PAYER" },
        subscriber: { firstName: "Test", lastName: "Patient", birthDate: "1970-01-01", memberId: "MEM123" },
        diagnosis: { code: diagCode.trim() },
        procedure: { code: hcpcs.trim() || "L1832" },
        serviceType: "30",
      }
      const res = await fetch(`${API}/${encodeURIComponent(packetId.trim())}/submit-prior-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      if (json && typeof json === "object" && "score" in json) {
        setPayerScorePreview(json)
      }
      setLastJson(json)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [diagCode, hcpcs, packetId])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="glass-panel-strong cockpit-sheen hud-outline rounded-[32px] p-5 sm:p-6">
          <p className="mb-3 inline-flex items-center rounded-full border border-[rgba(142,197,255,0.35)] bg-[rgba(118,243,255,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#a8dcff]">
            Packet Generator
          </p>
          <h1 className="font-display text-4xl uppercase tracking-[0.1em] text-white sm:text-5xl">Prior Auth Packets</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300/95">
            Creates LMN, SWO, clinical summary, and attachment metadata from structured inputs. All
            narratives trace to fields you enter — templates do not invent clinical facts.
          </p>
          <Link
            href="/admin/integrations/availity"
            className="mt-4 inline-block text-sm text-accent-blue hover:underline"
          >
            Availity integration
          </Link>
        </header>

        <section className="glass-panel rounded-[28px] p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Create packet (case + clinical)</h2>
          <form onSubmit={createPacket} className="grid gap-4 sm:grid-cols-2">
            <Field label="Case ID (existing Availity case cuid)" value={caseId} onChange={setCaseId} />
            <Field label="Device type key" value={deviceType} onChange={setDeviceType} />
            <Field label="Diagnosis code" value={diagCode} onChange={setDiagCode} />
            <Field label="Diagnosis description (optional, user-entered only)" value={diagDesc} onChange={setDiagDesc} />
            <Field label="Device category" value={deviceCategory} onChange={setDeviceCategory} />
            <Field label="HCPCS (optional)" value={hcpcs} onChange={setHcpcs} />
            <Field label="Physician name" value={physicianName} onChange={setPhysicianName} />
            <Field label="Physician NPI (optional)" value={physicianNpi} onChange={setPhysicianNpi} />
            <div className="sm:col-span-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-400">
                  Clinical summary lines (optional, reproduced verbatim)
                </span>
                <textarea
                  value={summaryLines}
                  onChange={(e) => setSummaryLines(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-accent-blue/50 focus:outline-none"
                />
              </label>
            </div>
            <Field label="SWO order date (YYYY-MM-DD)" value={orderDate} onChange={setOrderDate} />
            <div className="hidden sm:block" />
            <LabeledTextarea
              label="LMN clinical justification (user-entered)"
              value={clinicalJustification}
              onChange={setClinicalJustification}
              rows={3}
            />
            <LabeledTextarea
              label="LMN functional limitations (user-entered)"
              value={limitations}
              onChange={setLimitations}
              rows={2}
            />
            <LabeledTextarea
              label="LMN previous / failed treatments (user-entered)"
              value={failedTreatments}
              onChange={setFailedTreatments}
              rows={2}
            />
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={loading || !caseId.trim()}
                className="rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-6 py-2.5 text-sm font-semibold text-accent-blue transition hover:bg-accent-blue/20 disabled:opacity-50"
              >
                {loading ? "Working\u2026" : "Create & generate packet"}
              </button>
            </div>
          </form>
        </section>

        <section className="glass-panel rounded-[28px] p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Packet actions</h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Field label="Packet ID" value={packetId ?? ""} onChange={(v) => setPacketId(v || null)} />
            <button
              type="button"
              onClick={loadPacket}
              disabled={loading}
              className="rounded-xl border border-white/20 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
            >
              GET packet
            </button>
            <button
              type="button"
              onClick={runPayerScore}
              disabled={loading}
              className="rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-5 py-2.5 text-sm font-semibold text-accent-blue hover:bg-accent-blue/20 disabled:opacity-50"
            >
              Payer score (pre-submit)
            </button>
            <button
              type="button"
              onClick={regenerate}
              disabled={loading}
              className="rounded-xl border border-white/20 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={submitStub}
              disabled={loading}
              className="rounded-xl border border-accent-red/30 bg-accent-red/10 px-5 py-2.5 text-sm font-semibold text-accent-red hover:bg-accent-red/20 disabled:opacity-50"
            >
              Submit PA (stub payload)
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Submit uses a placeholder payer payload for wiring tests; align with real Availity authorizations JSON before
            production.
          </p>
        </section>

        {error && (
          <div className="rounded-xl border border-accent-red/30 bg-accent-red/5 p-3 text-sm text-accent-red">{error}</div>
        )}

        {payerScorePreview != null && (
          <section className="rounded-2xl border border-accent-blue/20 bg-accent-blue/[0.06] p-4">
            <h3 className="text-sm font-semibold text-accent-blue">Latest payer behavior score</h3>
            <p className="mt-1 text-xs text-slate-500">
              Run before submit to see risk, missing requirements, and workflow flags. Submit will score again and enforce
              gates.
            </p>
            <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-slate-300">
              {JSON.stringify(payerScorePreview, null, 2)}
            </pre>
          </section>
        )}

        {lastJson != null && (
          <pre className="max-h-[32rem] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-slate-300">
            {JSON.stringify(lastJson, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-accent-blue/50 focus:outline-none"
      />
    </label>
  )
}

function LabeledTextarea({
  label,
  value,
  onChange,
  rows,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows: number
}) {
  return (
    <label className="block sm:col-span-2">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-accent-blue/50 focus:outline-none"
      />
    </label>
  )
}
