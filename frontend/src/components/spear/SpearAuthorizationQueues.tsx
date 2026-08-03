"use client"

import Link from "next/link"
import React, { useEffect, useMemo, useState } from "react"

type CaseRow = Record<string, unknown>
const QUEUES = ["new_intake", "missing_documentation", "ocr_manual_classification", "policy_review", "routing_exceptions", "reviewer_certification", "ready_to_transmit", "fax_failures", "awaiting_payer_disposition", "additional_information_requests", "denials_and_appeals", "ready_for_fulfillment", "pod_outstanding", "ready_to_bill", "tebra_staged_or_exception"]

function memberships(record: CaseRow) {
  const status = String(record.status || ""), authorization = String(record.authorization_status || record.auth_status || "RECEIVED")
  const rows: string[] = []
  if (["created", "intake_received", "trident_review"].includes(status) || ["RECEIVED", "INTAKE_VALIDATION"].includes(authorization)) rows.push("new_intake")
  if (status === "missing_docs" || authorization === "BLOCKED_MISSING_DOCUMENTATION" || (Array.isArray(record.missing_fields) && record.missing_fields.length)) rows.push("missing_documentation")
  if (record.manual_classification_required === true || record.ocr_confidence === "low") rows.push("ocr_manual_classification")
  if (authorization === "BLOCKED_POLICY_UNVERIFIED") rows.push("policy_review")
  if (["BLOCKED_ROUTING_UNVERIFIED", "BLOCKED_DESTINATION_UNVERIFIED"].includes(authorization)) rows.push("routing_exceptions")
  if (authorization === "PACKET_REVIEW_REQUIRED") rows.push("reviewer_certification")
  if (["REVIEWER_CERTIFIED", "SUBMISSION_QUEUED"].includes(authorization)) rows.push("ready_to_transmit")
  if (authorization === "SUBMISSION_FAILED") rows.push("fax_failures")
  if (["SUBMISSION_SENT", "DELIVERY_CONFIRMED", "PAYER_DISPOSITION_PENDING"].includes(authorization)) rows.push("awaiting_payer_disposition")
  if (authorization === "ADDITIONAL_INFORMATION_REQUESTED") rows.push("additional_information_requests")
  if (["DENIED", "APPEAL_REQUIRED", "CONCURRENT_REVIEW_PENDING", "RETRO_REVIEW_PENDING", "CLAIMS_REVIEW_PENDING"].includes(authorization)) rows.push("denials_and_appeals")
  if (status === "ready_to_fulfill") rows.push("ready_for_fulfillment")
  if (["pod_needed", "pod_generated", "delivery_recorded"].includes(status)) rows.push("pod_outstanding")
  if (status === "ready_to_bill") rows.push("ready_to_bill")
  if (["tebra_ready", "staged_for_upload"].includes(status) || String(record.tebra_status || "").includes("exception")) rows.push("tebra_staged_or_exception")
  return rows
}

export function SpearAuthorizationQueues() {
  const [cases, setCases] = useState<CaseRow[]>([])
  const [selected, setSelected] = useState("new_intake")
  const [error, setError] = useState("")
  useEffect(() => { fetch("/api/spear/cases", { cache: "no-store" }).then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`); setCases(Array.isArray(body.cases) ? body.cases : []) }).catch((reason) => setError(reason instanceof Error ? reason.message : "Queue unavailable")) }, [])
  const groups = useMemo<Record<string, CaseRow[]>>(() => Object.fromEntries(QUEUES.map((queue) => [queue, cases.filter((record) => !record.archived && memberships(record).includes(queue))])), [cases])
  const rows = groups[selected] || []
  return <div style={{ background: "#FFFFFF", minHeight: "100%" }}>
    <div style={{ padding: "24px 32px", borderBottom: "1px solid #E2E8F0" }}><h1 style={{ margin: "0 0 4px", fontSize: 22, color: "#0F172A" }}>Authorization Work Queues</h1><p style={{ margin: 0, fontSize: 13, color: "#64748B" }}>Operational queues derived from the persisted TRIDENT state machine.</p></div>
    {error ? <div style={{ margin: "16px 32px", padding: 12, borderRadius: 8, background: "#FEF2F2", color: "#B91C1C" }}>{error}</div> : null}
    <div style={{ padding: 24, display: "grid", gridTemplateColumns: "230px 1fr", gap: 18 }}>
      <div style={{ display: "grid", gap: 6, alignContent: "start" }}>{QUEUES.map((queue) => <button key={queue} onClick={() => setSelected(queue)} style={{ border: `1px solid ${selected === queue ? "#93C5FD" : "#E2E8F0"}`, borderRadius: 8, padding: "10px 12px", background: selected === queue ? "#EFF6FF" : "#FFFFFF", color: selected === queue ? "#1D4ED8" : "#475569", textAlign: "left", fontSize: 12, fontWeight: 800, display: "flex", justifyContent: "space-between" }}><span>{queue.replace(/_/g, " ")}</span><span>{groups[queue]?.length || 0}</span></button>)}</div>
      <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, overflow: "auto" }}>{rows.length ? <table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr style={{ background: "#F8FAFC" }}>{["Patient", "DOB", "Payer / member", "Order / HCPCS", "Authorization status", "Updated"].map((heading) => <th key={heading} style={{ padding: 11, textAlign: "left", fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>{heading}</th>)}</tr></thead><tbody>{rows.map((record) => { const codes = record.final_hcpcs || record.hcpcs; return <tr key={String(record.id)} style={{ borderTop: "1px solid #F1F5F9" }}><td style={{ padding: 12, fontSize: 13, fontWeight: 800 }}><Link href={`/spear/cases/${record.id}`} style={{ color: "#0F172A", textDecoration: "none" }}>{String(record.patient_name || "Missing patient")}</Link></td><td style={{ padding: 12, fontSize: 12 }}>{String(record.dob || "Missing")}</td><td style={{ padding: 12, fontSize: 12 }}>{String(record.payer || "Missing")}<div style={{ color: "#64748B" }}>{String(record.member_id || "Member ID missing")}</div></td><td style={{ padding: 12, fontSize: 12 }}>{String(record.order_id || "Missing")}<div style={{ color: "#64748B" }}>{Array.isArray(codes) ? codes.join(", ") : String(codes || "Pending")}</div></td><td style={{ padding: 12, fontSize: 11, fontWeight: 800, color: "#1D4ED8" }}>{String(record.authorization_status || record.auth_status || "RECEIVED")}</td><td style={{ padding: 12, fontSize: 11, color: "#64748B" }}>{record.updated_at ? new Date(String(record.updated_at)).toLocaleString() : "Not captured"}</td></tr>})}</tbody></table> : <div style={{ padding: 56, textAlign: "center", color: "#64748B", fontSize: 13 }}>No cases in {selected.replace(/_/g, " ")}.</div>}</div>
    </div>
  </div>
}
