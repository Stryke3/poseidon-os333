"use client"

import React, { useEffect, useState } from "react"

function fmt(val: unknown): string {
  if (val === null || val === undefined || val === "") return "--"
  return String(val)
}

export function SpearRevenueSupport() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    fetch("/api/spear/revenue", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown>>) : Promise.resolve(null)))
      .catch(() => null)
      .then((d) => {
        if (!d) setUnavailable(true)
        else setData((d.metrics && typeof d.metrics === "object" ? d.metrics : d) as Record<string, unknown>)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div style={{ padding: "48px 32px", textAlign: "center", color: "#6B7280", fontSize: "13px" }}>Loading…</div>
  }

  const cards = [
    { label: "Submitted Cases", key: "submitted_cases" },
    { label: "Paid Cases", key: "paid_cases" },
    { label: "Denied Cases", key: "denied_cases" },
    { label: "Allowed Amount", key: "allowed_amount" },
    { label: "Collected", key: "paid_amount" },
    { label: "Denial Rate", key: "denial_rate" },
  ]

  return (
    <div style={{ background: "#FFFFFF", minHeight: "100%" }}>
      <div style={{ padding: "24px 32px", borderBottom: "1px solid #E5E7EB" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#0F172A", margin: 0, marginBottom: "4px" }}>Revenue Support</h1>
        <p style={{ fontSize: "13px", color: "#6B7280", margin: 0 }}>Billing packet preparation and revenue cycle tracking</p>
      </div>

      {unavailable && (
        <div style={{ margin: "16px 32px", padding: "12px 16px", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "8px", fontSize: "13px", color: "#92400E" }}>
          Live data unavailable — check API connectivity.
        </div>
      )}

      <div style={{ padding: "24px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", marginBottom: "24px" }}>
          {cards.map((card) => (
            <div key={card.key} style={{ border: "1px solid #E5E7EB", borderRadius: "8px", padding: "20px", background: "#FFFFFF" }}>
              <div style={{ fontSize: "26px", fontWeight: 700, color: "#0F172A", lineHeight: 1, marginBottom: "8px" }}>
                {fmt(data?.[card.key])}
              </div>
              <div style={{ fontSize: "12px", color: "#6B7280" }}>{card.label}</div>
            </div>
          ))}
        </div>

        {data && (
          <div style={{ border: "1px solid #E5E7EB", borderRadius: "8px", padding: "20px", background: "#F9FAFB" }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A", margin: "0 0 12px" }}>Revenue Detail</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {Object.entries(data).map(([key, val]) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #E5E7EB", paddingBottom: "8px" }}>
                  <span style={{ fontSize: "12px", color: "#6B7280", fontFamily: "monospace" }}>{key}</span>
                  <span style={{ fontSize: "13px", color: "#374151", fontWeight: 500 }}>{fmt(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
