"use client"

import React, { useEffect, useState } from "react"

function fmt(val: unknown): string {
  if (val === null || val === undefined || val === "") return "--"
  return String(val)
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function SpearTrident() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [caseId, setCaseId] = useState("")
  const [review, setReview] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch('/api/trident/stats');
        const { status, payers } = await res.json();

        if (!res.ok) {
          setUnavailable(true)
          return
        }

        const statusData = objectValue(status)
        const snapshot = objectValue(statusData.snapshot)
        const counts = objectValue(snapshot.counts)
        const payerList = Array.isArray(payers)
          ? payers
          : Array.isArray(objectValue(payers).payers)
            ? objectValue(payers).payers as unknown[]
            : null
        const payerRulesActive = payerList ? payerList.length : Object.keys(objectValue(payers)).length

        setData({
          cases_reviewed: numberValue(
            statusData.total_records,
            statusData.cases_reviewed,
            counts.payment_outcomes,
            counts.claim_submissions,
            counts.eligibility_checks,
          ) ?? 0,
          risk_flags: numberValue(statusData.high_risk_count, statusData.risk_flags, counts.denials) ?? 0,
          payer_rules_active: payerRulesActive,
          playbooks_matched: numberValue(statusData.playbooks_matched, counts.learned_rates) ?? 0,
          avg_review_time: statusData.avg_review_time ?? "--",
        })
      } catch {
        setUnavailable(true)
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [])

  if (loading) {
    return <div style={{ padding: "48px 32px", textAlign: "center", color: "#6B7280", fontSize: "13px" }}>Loading…</div>
  }

  const cards = [
    { label: "Cases Reviewed", key: "cases_reviewed" },
    { label: "Risk Flags", key: "risk_flags" },
    { label: "Payer Rules Active", key: "payer_rules_active" },
    { label: "Playbooks Matched", key: "playbooks_matched" },
    { label: "Avg Review Time", key: "avg_review_time" },
  ]

  async function scoreCase() {
    setReview(null)
    const res = await fetch("/api/trident/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(caseId.trim() ? { case_id: caseId.trim() } : {
        patient_name: "Synthetic Review",
        dob: "1975-01-01",
        payer: "Synthetic Commercial",
        member_id: "SYN123456",
        provider: "Dr. Synthetic Provider",
        npi: "1234567890",
        hcpcs: ["L1833"],
        icd: ["M17.11"],
        laterality: "Right",
        order_date: "2026-05-19",
      }),
    })
    const payload = await res.json().catch(() => ({}))
    setReview({ http_status: res.status, ...payload })
  }

  return (
    <div style={{ background: "#FFFFFF", minHeight: "100%" }}>
      <div style={{ padding: "24px 32px", borderBottom: "1px solid #E5E7EB" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#0F172A", margin: 0, marginBottom: "4px" }}>Trident Intelligence</h1>
        <p style={{ fontSize: "13px", color: "#6B7280", margin: 0 }}>Documentation review, risk flags, and routing intelligence</p>
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

        <div style={{ border: "1px solid #E5E7EB", borderRadius: "8px", padding: "16px", background: "#F9FAFB", fontSize: "12px", color: "#6B7280", lineHeight: 1.6 }}>
          <strong style={{ color: "#374151" }}>Trident provides operational documentation intelligence only.</strong>{" "}
          Clinical decisions, medical necessity, and patient care determinations remain with licensed providers.
        </div>

        <div style={{ marginTop: "16px", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "16px", background: "#FFFFFF" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A", margin: "0 0 10px" }}>Score Case</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={caseId} onChange={(event) => setCaseId(event.target.value)} placeholder="case_id or blank for synthetic check" style={{ flex: 1, border: "1px solid #E5E7EB", borderRadius: "6px", padding: "9px 10px", fontSize: "13px" }} />
            <button onClick={scoreCase} style={{ border: "none", borderRadius: "6px", background: "#0F172A", color: "#FFFFFF", padding: "9px 14px", fontSize: "13px", fontWeight: 600 }}>Run</button>
          </div>
          {review ? (
            <pre style={{ marginTop: "12px", maxHeight: 260, overflow: "auto", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "6px", padding: "10px", fontSize: "11px", color: "#334155" }}>{JSON.stringify(review, null, 2)}</pre>
          ) : null}
        </div>
      </div>
    </div>
  )
}
