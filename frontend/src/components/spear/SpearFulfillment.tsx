"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

type CaseRow = Record<string, unknown>

function authorizationGate(record: CaseRow) {
  const status = String(record.authorization_status || record.auth_status || "RECEIVED").toUpperCase()
  const noAuthEvidence = record.auth_requirement === "not_required" && Boolean(record.auth_requirement_verified_at && record.auth_requirement_verified_by && record.auth_requirement_evidence_ref && record.auth_requirement_source && record.auth_requirement_verification_method)
  const override = record.authorization_gate_override === true && Boolean(record.authorization_override_reason && record.authorization_override_by && record.authorization_override_at)
  const cleared = ["DELIVERY_CONFIRMED", "PAYER_DISPOSITION_PENDING", "AUTHORIZED", "PARTIALLY_AUTHORIZED"].includes(status) || (["PAYER_NO_AUTH_REQUIRED_VERIFIED", "NO_AUTH_REQUIRED_VERIFIED"].includes(status) && noAuthEvidence) || override
  return { cleared, reason: cleared ? "CLEARED" : "Confirmed delivery or verified no-authorization-required evidence is required." }
}

export function SpearFulfillment() {
  const [cases, setCases] = useState<CaseRow[]>([])
  const [error, setError] = useState("")
  useEffect(() => { fetch("/api/spear/cases", { cache: "no-store" }).then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`); setCases(Array.isArray(payload.cases) ? payload.cases : []) }).catch((reason) => setError(reason instanceof Error ? reason.message : "Fulfillment queue unavailable")) }, [])
  const items = useMemo(() => cases.filter((record) => !record.archived && ["ready_to_fulfill", "billing_packet_generated", "pod_needed", "pod_generated", "delivery_recorded"].includes(String(record.status || ""))), [cases])
  const ready = items.filter((item) => authorizationGate(item).cleared)
  const held = items.filter((item) => !authorizationGate(item).cleared)
  return <div style={{ background: "#FFFFFF", minHeight: "100%" }}>
    <div style={{ padding: "20px 24px", borderBottom: "1px solid #E2E8F0" }}><h1 style={{ margin: "0 0 4px", fontSize: 22, color: "#0F172A" }}>Fulfillment</h1><p style={{ margin: 0, fontSize: 13, color: "#64748B" }}>Only authorization-cleared cases may proceed. Held cases remain visible with the blocking reason.</p></div>
    {error ? <div style={{ margin: 20, padding: 12, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, color: "#B91C1C", fontSize: 12 }}>{error}</div> : null}
    <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
      {[["Ready", ready.length, "#166534"], ["Authorization hold", held.length, "#B45309"], ["Queue total", items.length, "#1D4ED8"]].map(([label, value, color]) => <div key={String(label)} style={{ border: "1px solid #E2E8F0", borderRadius: 9, padding: 15 }}><div style={{ fontSize: 24, color: String(color), fontWeight: 900 }}>{value}</div><div style={{ fontSize: 11, color: "#64748B" }}>{label}</div></div>)}
    </div>
    <div style={{ padding: "0 20px 20px", overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #E2E8F0" }}><thead><tr style={{ background: "#F8FAFC" }}>{["Case", "Patient", "Product / HCPCS", "Stage", "Authorization gate"].map((heading) => <th key={heading} style={{ padding: 10, textAlign: "left", fontSize: 10, textTransform: "uppercase", color: "#64748B" }}>{heading}</th>)}</tr></thead><tbody>{items.map((item) => { const gate = authorizationGate(item); const codes = item.final_hcpcs || item.hcpcs; return <tr key={String(item.id)} style={{ borderTop: "1px solid #E2E8F0" }}><td style={{ padding: 11, fontSize: 12 }}><Link href={`/spear/cases/${item.id}`} style={{ color: "#2563EB", fontWeight: 800 }}>{String(item.order_id || item.id)}</Link></td><td style={{ padding: 11, fontSize: 12 }}>{String(item.patient_name || "Missing")}</td><td style={{ padding: 11, fontSize: 12 }}>{String(item.product || "—")}<div style={{ color: "#64748B" }}>{Array.isArray(codes) ? codes.join(", ") : String(codes || "Pending")}</div></td><td style={{ padding: 11, fontSize: 11 }}>{String(item.status || "—").replace(/_/g, " ")}</td><td style={{ padding: 11, fontSize: 11, color: gate.cleared ? "#166534" : "#B45309", fontWeight: 800 }}>{gate.cleared ? "CLEARED" : gate.reason}</td></tr>})}</tbody></table>{!items.length && !error ? <div style={{ padding: 50, textAlign: "center", color: "#64748B", fontSize: 13 }}>No cases are currently at a fulfillment stage.</div> : null}</div>
  </div>
}
