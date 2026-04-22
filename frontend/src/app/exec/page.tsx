"use client"

import { useCallback, useState } from "react"

type Json = Record<string, unknown>

export default function ExecFlowPage() {
  const [patientId, setPatientId] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [log, setLog] = useState<string>("")
  const [busy, setBusy] = useState<string | null>(null)

  const append = useCallback((line: string) => {
    setLog((prev) => `${prev}${prev ? "\n" : ""}${line}`)
  }, [])

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(label)
      try {
        await fn()
      } finally {
        setBusy(null)
      }
    },
    [],
  )

  const btnClass =
    "rounded-lg px-4 py-3 text-left text-sm font-medium transition disabled:opacity-50 " +
    "bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed"

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Patient execution</h1>
        <p className="mt-1 text-sm text-slate-400">
          Five steps: create patient → generate SWO → upload signed document → build claim → submit via Stedi. Step 1 also
          creates the order (minimal billable row) required for the pipeline.
        </p>
      </div>

      <div className="grid gap-3">
        <button
          type="button"
          disabled={!!busy}
          className={btnClass}
          onClick={() =>
            run("create", async () => {
              const patientBody = {
                first_name: "Minimal",
                last_name: "Patient",
                date_of_birth: "1980-01-15",
                insurances: [{ payer_name: "Minimal Payer", member_id: "MEM123", is_primary: true }],
              }
              const pr = await fetch("/api/exec/patient", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patientBody),
              })
              const pj = (await pr.json().catch(() => ({}))) as Json & { id?: string }
              if (!pr.ok) {
                append(`Create patient failed: ${pr.status} ${JSON.stringify(pj)}`)
                return
              }
              const pid = pj.id as string
              setPatientId(pid)
              append(`Patient ${pid}`)

              const orderBody = {
                patient_id: pid,
                claim_strategy: "EDI",
                status: "intake",
                date_of_service: new Date().toISOString().slice(0, 10),
                diagnoses: [{ icd10_code: "Z00.00", is_primary: true, sequence: 1 }],
                line_items: [
                  {
                    hcpcs_code: "E0110",
                    quantity: 1,
                    billed_amount: 150.0,
                  },
                ],
              }
              const or = await fetch("/api/exec/order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(orderBody),
              })
              const oj = (await or.json().catch(() => ({}))) as Json & { id?: string }
              if (!or.ok) {
                append(`Create order failed: ${or.status} ${JSON.stringify(oj)}`)
                return
              }
              const oid = oj.id as string
              setOrderId(oid)
              append(`Order ${oid}`)
            })
          }
        >
          {busy === "create" ? "Working…" : "1 · Create patient + order"}
        </button>

        <button
          type="button"
          disabled={!!busy || !orderId}
          className={btnClass}
          onClick={() =>
            run("swo", async () => {
              const res = await fetch(`/api/exec/order/${orderId}/generate-swo`, { method: "POST" })
              const j = await res.json().catch(() => ({}))
              append(`Generate SWO: ${res.status} ${JSON.stringify(j).slice(0, 800)}`)
            })
          }
        >
          {busy === "swo" ? "Working…" : "2 · Generate SWO (PDF)"}
        </button>

        <label className={`block ${!orderId ? "pointer-events-none opacity-50" : ""}`}>
          <div className={btnClass + " cursor-pointer"}>{busy === "upload" ? "Working…" : "3 · Upload signed SWO + docs"}</div>
          <input
            type="file"
            className="sr-only"
            disabled={!!busy || !orderId}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file || !orderId) return
              void run("upload", async () => {
                const fd = new FormData()
                fd.append("file", file)
                fd.append("doc_type", "signed_swo")
                const res = await fetch(`/api/exec/order/${orderId}/upload-signed`, { method: "POST", body: fd })
                const j = await res.json().catch(() => ({}))
                append(`Upload: ${res.status} ${JSON.stringify(j).slice(0, 800)}`)
                e.target.value = ""
              })
            }}
          />
        </label>

        <button
          type="button"
          disabled={!!busy || !orderId}
          className={btnClass}
          onClick={() =>
            run("build", async () => {
              const res = await fetch(`/api/exec/order/${orderId}/build-claim`, { method: "POST" })
              const j = await res.json().catch(() => ({}))
              append(`Build claim (validate): ${res.status} ${JSON.stringify(j).slice(0, 1200)}`)
            })
          }
        >
          {busy === "build" ? "Working…" : "4 · Build claim (EDI validate)"}
        </button>

        <button
          type="button"
          disabled={!!busy || !orderId}
          className={btnClass}
          onClick={() =>
            run("submit", async () => {
              const res = await fetch(`/api/exec/order/${orderId}/submit-stedi`, { method: "POST" })
              const j = await res.json().catch(() => ({}))
              append(`Submit Stedi: ${res.status} ${JSON.stringify(j).slice(0, 1200)}`)
            })
          }
        >
          {busy === "submit" ? "Working…" : "5 · Submit to Stedi"}
        </button>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-emerald-200/90 whitespace-pre-wrap">
        {patientId && <div>patient_id={patientId}</div>}
        {orderId && <div>order_id={orderId}</div>}
        {log || "Output appears here."}
      </div>
    </div>
  )
}
