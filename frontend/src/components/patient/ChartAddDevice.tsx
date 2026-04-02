"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

export type ChartOrderPick = { id: string }

function formatErr(data: Record<string, unknown>, status: number): string {
  const d = data?.detail
  if (typeof d === "string") return d
  if (d && typeof d === "object" && "message" in d && typeof (d as { message?: string }).message === "string") {
    return (d as { message: string }).message
  }
  if (typeof data?.error === "string") return data.error
  return `Request failed (${status})`
}

export function ChartAddDevice({ patientId, orders }: { patientId: string; orders: ChartOrderPick[] }) {
  const router = useRouter()
  const [orderId, setOrderId] = useState(() => (orders.length === 1 ? orders[0].id : ""))
  const [hcpcs, setHcpcs] = useState("")
  const [qty, setQty] = useState(1)
  const [description, setDescription] = useState("")
  const [unitPrice, setUnitPrice] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const canSubmit =
    orders.length > 0 && Boolean(orderId) && hcpcs.trim().length >= 1 && !submitting

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!canSubmit) return
      setSubmitting(true)
      setError(null)
      setSuccess(false)
      try {
        const body: Record<string, unknown> = {
          hcpcs_code: hcpcs.trim().toUpperCase(),
          quantity: Math.max(1, Math.floor(Number(qty)) || 1),
        }
        if (description.trim()) body.description = description.trim()
        const up = parseFloat(unitPrice)
        if (unitPrice.trim() !== "" && Number.isFinite(up)) body.unit_price = up

        const res = await fetch(`/api/patients/${patientId}/orders/${orderId}/line-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
        if (!res.ok) {
          throw new Error(formatErr(data, res.status))
        }
        setSuccess(true)
        setHcpcs("")
        setDescription("")
        setUnitPrice("")
        setQty(1)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Add device failed")
      } finally {
        setSubmitting(false)
      }
    },
    [canSubmit, patientId, orderId, hcpcs, qty, description, unitPrice, router],
  )

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        No orders on file. Create an order for this patient before adding devices.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Add device</p>
      <p className="mt-1 text-xs text-slate-400">
        Adds an HCPCS line item to the selected order. Requires create_orders or update_patients.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-400">
            Order
            <select
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              required
            >
              {orders.length > 1 ? <option value="">Select order…</option> : null}
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id.slice(0, 8).toUpperCase()}…
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-400">
            HCPCS code
            <input
              value={hcpcs}
              onChange={(e) => setHcpcs(e.target.value)}
              placeholder="e.g. L1833"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white"
              required
              maxLength={20}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-slate-400">
            Quantity
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(parseInt(e.target.value, 10) || 1)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400 sm:col-span-2">
            Description (optional)
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        <label className="block text-xs text-slate-400">
          Unit price (optional)
          <input
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="0.00"
            className="mt-1 w-full max-w-xs rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          />
        </label>
        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>
        ) : null}
        {success ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            Device line added. Chart refreshed.
          </div>
        ) : null}
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg border border-accent-blue/40 bg-accent-blue/15 px-4 py-2 text-sm font-semibold text-accent-blue transition enabled:hover:bg-accent-blue/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add device"}
        </button>
      </form>
    </div>
  )
}
