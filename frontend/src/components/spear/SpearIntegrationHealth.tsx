"use client"

import { useEffect, useState } from "react"

type Health = Record<string, unknown>

function StatusCard({ title, data }: { title: string; data: Health }) {
  const status = String(data.status || (data.configured ? "configured" : "not_configured"))
  const good = ["healthy", "readable", "configured"].includes(status)
  return <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, background: "#FFFFFF", padding: 15 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><h3 style={{ margin: 0, fontSize: 14, color: "#0F172A" }}>{title}</h3><span style={{ borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 900, background: good ? "#DCFCE7" : "#FEF3C7", color: good ? "#166534" : "#92400E" }}>{status.replace(/_/g, " ")}</span></div>
    <div style={{ marginTop: 10, display: "grid", gap: 5 }}>{Object.entries(data).filter(([key]) => !["name", "status"].includes(key)).map(([key, value]) => <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11, borderTop: "1px solid #F1F5F9", paddingTop: 5 }}><span style={{ color: "#64748B" }}>{key.replace(/_/g, " ")}</span><span style={{ color: "#0F172A", fontWeight: 700, textAlign: "right", overflowWrap: "anywhere" }}>{typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}</span></div>)}</div>
  </div>
}

export function SpearIntegrationHealth() {
  const [data, setData] = useState<Health | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { fetch("/api/spear/integrations", { cache: "no-store" }).then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`); setData(payload) }).catch((reason) => setError(reason instanceof Error ? reason.message : "Health check failed")) }, [])
  const services = Array.isArray(data?.services) ? data.services as Health[] : []
  return <div style={{ minHeight: "100%", background: "#F8FAFC" }}>
    <div style={{ marginBottom: 18 }}><h1 style={{ margin: "0 0 4px", fontSize: 22, color: "#0F172A" }}>Integration Health</h1><p style={{ margin: 0, color: "#64748B", fontSize: 13 }}>Live configuration and reachability checks. No placeholder status values.</p></div>
    {error ? <div style={{ padding: 12, border: "1px solid #FECACA", borderRadius: 8, background: "#FEF2F2", color: "#B91C1C" }}>{error}</div> : !data ? <div style={{ color: "#64748B", fontSize: 13 }}>Running health checks…</div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
      <StatusCard title="Durable store" data={data.store as Health} />
      <StatusCard title="Authorization fax" data={data.fax as Health} />
      <StatusCard title="Tebra" data={data.tebra as Health} />
      {services.map((service) => <StatusCard key={String(service.name)} title={String(service.name || "Service")} data={service} />)}
    </div>}
    <p style={{ marginTop: 14, color: "#64748B", fontSize: 11 }}>Checked at {String(data?.checked_at || "pending")}</p>
  </div>
}
