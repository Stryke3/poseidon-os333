"use client"

import React, { useEffect, useState } from "react"

const API_BASE = "https://api.strykefox.com/api/v1/spear"

type FulfillmentItem = Record<string, unknown>

function fmt(val: unknown): string {
  if (val === null || val === undefined || val === "") return "--"
  return String(val)
}

export function SpearFulfillment() {
  const [items, setItems] = useState<FulfillmentItem[]>([])
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/fulfillment`)
      .then((r) => (r.ok ? (r.json() as Promise<unknown>) : Promise.resolve(null)))
      .catch(() => null)
      .then((data) => {
        if (!data) { setUnavailable(true); return }
        const d = data as Record<string, unknown>
        const list = Array.isArray(data) ? data : Array.isArray(d.items) ? (d.items as FulfillmentItem[]) : []
        setItems(list)
        if (!Array.isArray(data)) setSummary(d)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div style={{ padding: "48px 32px", textAlign: "center", color: "#6B7280", fontSize: "13px" }}>Loading…</div>
  }

  return (
    <div style={{ background: "#FFFFFF", minHeight: "100%" }}>
      <div style={{ padding: "24px 32px", borderBottom: "1px solid #E5E7EB" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#0F172A", margin: 0, marginBottom: "4px" }}>Fulfillment</h1>
        <p style={{ fontSize: "13px", color: "#6B7280", margin: 0 }}>Order fulfillment queue and delivery tracking</p>
      </div>

      {unavailable && (
        <div style={{ margin: "16px 32px", padding: "12px 16px", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "8px", fontSize: "13px", color: "#92400E" }}>
          Live data unavailable — check API connectivity.
        </div>
      )}

      {summary && (
        <div style={{ padding: "24px 32px 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px", marginBottom: "24px" }}>
            {["pending", "in_progress", "completed", "failed"].map((key) => (
              <div key={key} style={{ border: "1px solid #E5E7EB", borderRadius: "8px", padding: "16px", background: "#FFFFFF" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color: "#0F172A", lineHeight: 1, marginBottom: "6px" }}>{fmt(summary[key])}</div>
                <div style={{ fontSize: "12px", color: "#6B7280", textTransform: "capitalize" }}>{key.replace("_", " ")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: summary ? "0 32px 24px" : "24px 32px" }}>
        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 32px", color: "#6B7280", fontSize: "13px" }}>
            {unavailable ? "--" : "No fulfillment items found."}
          </div>
        ) : (
          <div style={{ border: "1px solid #E5E7EB", borderRadius: "8px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                  {["Order ID", "Patient", "Product", "Status", "Ship By"].map((h) => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: "11px", fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "12px 16px", fontSize: "12px", fontFamily: "monospace", color: "#374151" }}>{fmt(item.order_id ?? item.id)}</td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#0F172A" }}>{fmt(item.patient_name ?? item.patient)}</td>
                    <td style={{ padding: "12px 16px", fontSize: "13px", color: "#374151" }}>{fmt(item.product ?? item.hcpcs_code)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "12px", background: "#F3F4F6", color: "#374151" }}>
                        {fmt(item.status)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "12px", color: "#6B7280" }}>{fmt(item.ship_by ?? item.ship_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
