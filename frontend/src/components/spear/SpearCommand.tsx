"use client"

import React, { useEffect, useState } from "react"

const API_BASE = "https://api.strykefox.com/api/v1/spear"

const AVAILITY_KEYS = new Set(["availity", "availity_sftp", "availity_payer", "prior_auth"])

const WORKFLOW_STAGES = [
  { key: "intake", label: "Intake" },
  { key: "poseidon", label: "Poseidon" },
  { key: "trident", label: "Trident" },
  { key: "execution", label: "Execution" },
  { key: "revenue", label: "Revenue" },
  { key: "ledger", label: "Ledger" },
]

const METRIC_KEYS = [
  { key: "open_cases", label: "Open Cases" },
  { key: "missing_docs", label: "Missing Docs" },
  { key: "trident_review", label: "Trident Review" },
  { key: "ready_fulfillment", label: "Ready to Fulfill" },
  { key: "pod_needed", label: "POD Needed" },
  { key: "revenue_support", label: "Revenue Support" },
  { key: "tebra_ready", label: "Tebra Ready" },
  { key: "high_risk", label: "High-Risk Flags" },
]

function fmt(val: unknown): string {
  if (val === null || val === undefined || val === "") return "--"
  return String(val)
}

interface SourceItem {
  key: string
  label: string
  ok: boolean
  message?: string
  code?: number
}

function chipColors(src: SourceItem) {
  if (src.ok) return { bg: "#0A2218", color: "#34D399", border: "#0D3A28", dot: "#34D399" }
  const is530 = src.code === 530 || src.message?.includes("530")
  if (is530) return { bg: "#1A1500", color: "#C08403", border: "#2A2000", dot: "#C08403" }
  return { bg: "#1A0A0A", color: "#F87171", border: "#2A1010", dot: "#F87171" }
}

export function SpearCommand() {
  const [statusData, setStatusData] = useState<Record<string, unknown> | null>(null)
  const [metricsData, setMetricsData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/status`)
        .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown>>) : Promise.resolve(null)))
        .catch(() => null),
      fetch(`${API_BASE}/metrics`)
        .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown>>) : Promise.resolve(null)))
        .catch(() => null),
    ])
      .then(([s, m]) => {
        setStatusData(s)
        setMetricsData(m)
        if (!s && !m) setUnavailable(true)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ padding: "48px 32px", textAlign: "center", color: "#475569", fontSize: "13px" }}>
        Loading…
      </div>
    )
  }

  const workflow = (statusData?.workflow ?? {}) as Record<string, { active?: boolean; count?: number }>
  const metrics = (metricsData ?? {}) as Record<string, unknown>
  const sources: SourceItem[] = Array.isArray(statusData?.sources)
    ? (statusData!.sources as SourceItem[]).filter((s) => !AVAILITY_KEYS.has(s.key))
    : []
  const hasDegraded = !unavailable && sources.length > 0 && sources.some((s) => !s.ok)

  return (
    <div style={{ background: "#05070B", minHeight: "100%" }}>
      <div style={{ padding: "24px 32px", borderBottom: "1px solid #1A2433", background: "#0B1220" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#E2E8F0", margin: 0, marginBottom: "4px" }}>Command</h1>
        <p style={{ fontSize: "13px", color: "#64748B", margin: 0 }}>SPEAR workflow overview</p>
      </div>

      {unavailable && (
        <div style={{ margin: "16px 32px 0", padding: "12px 16px", background: "#1A1500", border: "1px solid #2A2000", borderRadius: "8px", fontSize: "13px", color: "#C08403" }}>
          Live data unavailable — check API connectivity.
        </div>
      )}

      {hasDegraded && (
        <div style={{ margin: "16px 32px 0", padding: "12px 16px", background: "#1A1500", border: "1px solid #2A2000", borderRadius: "8px", fontSize: "13px", color: "#C08403" }}>
          <strong style={{ fontWeight: 600 }}>Command surface degraded.</strong>{" "}
          One or more operational dependencies did not return live data. Counts remain source-bound; no mock data is displayed.
        </div>
      )}

      {sources.length > 0 && (
        <div style={{ margin: "16px 32px 0" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {sources.map((src) => {
              const c = chipColors(src)
              return (
                <span key={src.key} title={src.message} style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 500,
                  background: c.bg, color: c.color, border: `1px solid ${c.border}`,
                }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
                  {src.label}
                  {!src.ok && (src.code === 530 || src.message?.includes("530")) && (
                    <span style={{ fontSize: "10px", opacity: 0.8 }}> · FAULT 530</span>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ padding: "24px 32px", borderBottom: "1px solid #1A2433", background: "#0B1220", marginTop: "16px" }}>
        <p style={{ fontSize: "11px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 16px" }}>
          Workflow Pipeline
        </p>
        <div style={{ display: "flex", alignItems: "center" }}>
          {WORKFLOW_STAGES.map((stage, i) => {
            const stageData = workflow[stage.key]
            const isActive = stageData?.active ?? false
            const count = stageData?.count

            return (
              <React.Fragment key={stage.key}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", flex: 1 }}>
                  <div style={{
                    width: "36px", height: "36px", borderRadius: "50%",
                    background: isActive ? "#1E40AF" : "#0F172A",
                    border: `2px solid ${isActive ? "#3B82F6" : "#1E293B"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative", flexShrink: 0,
                  }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: isActive ? "#FFFFFF" : "#475569" }}>{i + 1}</span>
                    {count !== undefined && count > 0 && (
                      <span style={{
                        position: "absolute", top: "-6px", right: "-6px",
                        background: "#DC2626", color: "#FFFFFF", fontSize: "9px", fontWeight: 700,
                        padding: "1px 4px", borderRadius: "8px", minWidth: "14px", textAlign: "center",
                      }}>{count}</span>
                    )}
                  </div>
                  <span style={{ fontSize: "11px", color: isActive ? "#E2E8F0" : "#475569", fontWeight: isActive ? 600 : 400, textAlign: "center" }}>
                    {stage.label}
                  </span>
                </div>
                {i < WORKFLOW_STAGES.length - 1 && (
                  <div style={{ flex: 0.5, height: "1px", background: "#1A2433", marginBottom: "20px" }} />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      <div style={{ padding: "24px 32px" }}>
        <p style={{ fontSize: "11px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 16px" }}>
          Live Metrics
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px", marginBottom: "32px" }}>
          {METRIC_KEYS.map((m) => (
            <div key={m.key} style={{ background: "#0B1220", border: "1px solid #1A2433", borderRadius: "8px", padding: "16px" }}>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#E2E8F0", lineHeight: 1, marginBottom: "6px" }}>
                {fmt(metrics[m.key])}
              </div>
              <div style={{ fontSize: "12px", color: "#64748B" }}>{m.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {[
            { title: "Poseidon Vault", subtitle: "Source-of-truth case record", rows: [{ label: "Total Records", key: "poseidon_total_records" }, { label: "Storage Used", key: "poseidon_storage_used" }, { label: "Last Sync", key: "poseidon_last_sync" }] },
            { title: "Trident Intelligence", subtitle: "Review, flags, and routing", rows: [{ label: "Cases Reviewed", key: "trident_cases_reviewed" }, { label: "Risk Flags", key: "trident_risk_flags" }, { label: "Next Actions", key: "trident_next_actions" }] },
            { title: "Spear Execution", subtitle: "Workflow movement and fulfillment", rows: [{ label: "Active Tasks", key: "execution_active_tasks" }, { label: "Fulfillment Pending", key: "execution_fulfillment_pending" }, { label: "Completed Today", key: "execution_completed_today" }] },
            { title: "Revenue Support", subtitle: "Billing packet preparation", rows: [{ label: "Tebra Ready", key: "revenue_tebra_ready" }, { label: "Packet Prep", key: "revenue_packet_prep" }, { label: "Revenue at Risk", key: "revenue_at_risk" }] },
          ].map((panel) => (
            <div key={panel.title} style={{ background: "#0B1220", border: "1px solid #1A2433", borderRadius: "8px", padding: "24px" }}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#E2E8F0", marginBottom: "2px" }}>{panel.title}</div>
                <div style={{ fontSize: "11px", color: "#64748B" }}>{panel.subtitle}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {panel.rows.map((row) => (
                  <div key={row.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "#64748B" }}>{row.label}</span>
                    <span style={{ fontSize: "13px", color: "#94A3B8", fontWeight: 500 }}>
                      {fmt(statusData?.[row.key] ?? metricsData?.[row.key])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "16px", padding: "12px 16px", background: "#0B1220", border: "1px solid #1A2433", borderRadius: "8px", fontSize: "11px", color: "#475569", lineHeight: 1.5 }}>
          <strong style={{ color: "#64748B" }}>Trident provides operational documentation intelligence only.</strong>{" "}
          Clinical decisions, medical necessity, and patient care determinations remain with licensed providers.
        </div>
      </div>
    </div>
  )
}
