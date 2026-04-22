"use client"

import { useCallback, useEffect, useState } from "react"

const api = (p: string) => `/api/v1${p.startsWith("/") ? p : `/${p}`}`

type Workflow = {
  coding_cover_sheet_status: string
  pod_status: string
  final_packet_status: string
  tebra_record_status: string
  docusign_envelope_id: string | null
  final_packet_path: string | null
  delivery_date: string | null
  delivery_address: string | null
  pod_recipient_name: string | null
  pod_recipient_email: string | null
  product_description: string | null
  order_date_iso: string | null
  dos_iso: string | null
}

type OrderDetail = {
  id: string
  patient: Record<string, unknown>
  workflow: Workflow
}

type AuditLine = { id: string; action: string; details: Record<string, unknown>; created_at: string }
function pillClass(s: string) {
  if (s === "completed" || s === "saved" || s === "generated" || s === "assembled" || s === "approved") {
    return "bg-emerald-100 text-emerald-900"
  }
  if (s === "failed" || s === "voided" || s === "rejected") return "bg-red-100 text-red-900"
  return "bg-amber-100 text-amber-900"
}

export function Trident30OrderWorkspace({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [evalRes, setEvalRes] = useState<{ queue_bucket: string; rule_hits: { message: string; blocking: boolean }[] } | null>(null)
  const [readiness, setReadiness] = useState<Record<string, unknown> | null>(null)
  const [coverPreview, setCoverPreview] = useState<string>("")
  const [pod, setPod] = useState<{
    pod_status: string
    docusign_envelope_id: string | null
    events: Record<string, string | null>[]
  } | null>(null)
  const [audits, setAudits] = useState<AuditLine[]>([])
  const [handoff, setHandoff] = useState<{ rows: { action: string; created_at: string; details: unknown }[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setErr(null)
    const [o, e, r, c, p, a, h] = await Promise.all([
      fetch(api(`/orders/${orderId}`), { cache: "no-store" }),
      fetch(api(`/orders/${orderId}/evaluate`), { method: "POST", cache: "no-store" }),
      fetch(api(`/orders/${orderId}/readiness`), { cache: "no-store" }),
      fetch(api(`/orders/${orderId}/coding-cover-sheet`), { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)),
      fetch(api(`/orders/${orderId}/pod-status`), { cache: "no-store" }),
      fetch(api(`/orders/${orderId}/events`), { cache: "no-store" }),
      fetch(api(`/orders/${orderId}/handoff-history`), { cache: "no-store" }),
    ])
    if (!o.ok) {
      setErr("Order not found in TRIDENT 3 API")
      return
    }
    setOrder(await o.json())
    if (e.ok) setEvalRes(await e.json())
    if (r.ok) {
      const j = await r.json()
      setReadiness(j.readiness)
    }
    if (c?.document) {
      setCoverPreview((c.document as { content: string }).content || "")
    } else {
      setCoverPreview("")
    }
    if (p.ok) setPod(await p.json())
    if (a.ok) {
      const j = await a.json()
      setAudits(j.audit || [])
    }
    if (h.ok) setHandoff(await h.json())
  }, [orderId])

  useEffect(() => {
    void load()
  }, [load])

  async function post(path: string) {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(api(path), { method: "POST", cache: "no-store" })
      if (!res.ok) {
        setErr(`${path}: ${res.status}`)
        return
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function ingestPOD(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    setErr(null)
    try {
      const body = new FormData()
      body.set("file", f)
      const res = await fetch(api(`/orders/${orderId}/ingest-signed-pod`), { method: "POST", body })
      if (!res.ok) setErr("Ingest failed")
      else await load()
    } finally {
      setBusy(false)
    }
  }

  const wf = order?.workflow
  if (!order && !err) {
    return <p className="text-sm text-slate-500">Loading TRIDENT 3.0 state…</p>
  }
  if (err && !order) {
    return <p className="text-sm text-red-700">{err}</p>
  }
  if (!order) return null

  return (
    <div className="mt-6 space-y-4">
      <h3 className="text-lg font-semibold text-slate-800">TRIDENT 3.0</h3>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {evalRes && (
        <div
          className={`rounded-2xl border px-4 py-3 ${
            evalRes.queue_bucket === "green" ? "border-emerald-300 bg-emerald-50" : evalRes.queue_bucket === "red" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide">Queue: {evalRes.queue_bucket.toUpperCase()}</p>
          <ul className="mt-2 list-disc pl-4 text-sm">
            {evalRes.rule_hits.map((h, i) => (
              <li key={i} className={h.blocking ? "font-medium text-red-800" : ""}>
                {h.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {wf && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(["coding_cover_sheet_status", "pod_status", "final_packet_status", "tebra_record_status"] as const).map((k) => (
            <div key={k} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <span className="text-slate-600">{k.replaceAll("_", " ")}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pillClass((wf as Record<string, string>)[k])}`}>
                {String((wf as Record<string, string>)[k])}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Actions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ActionBtn disabled={busy} onClick={() => post(`/orders/${orderId}/generate-coding-cover-sheet`)}>
              Coding cover
            </ActionBtn>
            <ActionBtn disabled={busy} onClick={() => post(`/orders/${orderId}/generate-pod-packet`)}>
              POD packet
            </ActionBtn>
            <ActionBtn disabled={busy} onClick={() => post(`/orders/${orderId}/send-pod-docusign`)}>
              Send DocuSign (stub)
            </ActionBtn>
            <ActionBtn disabled={busy} onClick={() => post(`/orders/${orderId}/generate-final-packet`)}>
              Final packet
            </ActionBtn>
            <ActionBtn disabled={busy} onClick={() => post(`/orders/${orderId}/mark-saved-to-tebra`)}>
              Mark Tebra
            </ActionBtn>
            <ActionBtn
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await load()
                setBusy(false)
              }}
            >
              Refresh
            </ActionBtn>
          </div>
          <label className="mt-3 block text-sm">
            <span className="text-slate-600">Ingest signed POD</span>
            <input type="file" className="mt-1 block w-full text-xs" onChange={ingestPOD} accept=".pdf,image/*" />
          </label>
        </div>
        {readiness && (
          <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
            <p className="text-xs font-semibold uppercase text-slate-500">Readiness</p>
            <pre className="mt-2 max-h-48 overflow-auto text-xs leading-relaxed">{JSON.stringify(readiness, null, 2)}</pre>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Coding cover (preview)</p>
          {coverPreview ? (
            <pre className="mt-2 max-h-64 overflow-auto text-xs text-slate-800">{coverPreview}</pre>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Generate a coding cover sheet to preview.</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">POD / DocuSign (stub)</p>
          {pod && (
            <div className="mt-2 text-sm text-slate-800">
              <p>
                <span className="font-medium">POD status:</span> {pod.pod_status}
              </p>
              {pod.docusign_envelope_id && (
                <p className="text-xs text-slate-500">Envelope: {pod.docusign_envelope_id}</p>
              )}
              <ul className="mt-2 space-y-1 text-xs">
                {(pod.events || []).map((e, i) => (
                  <li key={String(e.id ?? i)}>
                    {String(e.status ?? "—")} · {String(e.envelope_id ?? "—")} · {String(e.recipient_email ?? "—")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Audit (actions)</p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-700">
            {audits.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.action}</span> · {new Date(a.created_at).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
        {handoff && handoff.rows?.length > 0 && (
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Tebra handoff</p>
            <ul className="mt-2 space-y-1 text-xs">
              {handoff.rows.map((h, i) => (
                <li key={i}>
                  {h.action} @ {new Date(h.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function ActionBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
    >
      {children}
    </button>
  )
}
