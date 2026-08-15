"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import React, { useEffect, useMemo, useState } from "react"
import { getSpearNextAction, getStageLabel, isArchivedCase, isSyntheticCase } from "@/lib/spear-next-action"

const API_BASE = "/api/spear"

type Case = Record<string, unknown>

const FILTERS = [
  { key: "needs-action", label: "Needs Action" },
  { key: "awaiting-provider", label: "Awaiting Provider" },
  { key: "ready-to-fulfill", label: "Ready to Fulfill" },
  { key: "pod-needed", label: "POD Needed" },
  { key: "tebra-staged", label: "Tebra Staged" },
  { key: "ready-to-bill", label: "Ready to Bill" },
  { key: "all", label: "All Cases" },
  { key: "synthetic", label: "Synthetic Tests" },
]

function fmt(val: unknown, fallback = "Not captured"): string {
  if (val === null || val === undefined || val === "") return fallback
  if (Array.isArray(val)) return val.length ? val.join(", ") : fallback
  return String(val)
}

function patientName(c: Case) {
  return fmt(c.patient_name ?? c.patient, "Missing patient")
}

function productLine(c: Case) {
  const product = fmt(c.product ?? c.order_type, "")
  const hcpcs = fmt(c.final_hcpcs ?? c.operator_approved_hcpcs ?? c.trident_recommended_hcpcs ?? c.source_hcpcs ?? c.hcpcs, "")
  if (product && hcpcs) return `${product} — ${hcpcs}`
  return product || hcpcs || "Assigned by Trident"
}

function createdDate(c: Case) {
  const raw = String(c.created_at || c.created || "")
  const date = raw ? new Date(raw) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function formatCreated(c: Case) {
  const date = createdDate(c)
  if (!date) return "Not captured"
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.max(0, Math.floor(diff / 36e5))
  const today = date.toDateString() === now.toDateString()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString() === date.toDateString()
  if (today) return `Today, ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
  if (yesterday) return "Yesterday"
  if (hours < 72) return `${hours} hours open`
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

function age(c: Case) {
  const date = createdDate(c)
  if (!date) return "Not captured"
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / 36e5))
  if (hours < 1) return "New"
  if (hours < 24) return `${hours}h open`
  return `${Math.floor(hours / 24)}d open`
}

function priority(c: Case) {
  const value = String(c.priority || "").trim()
  if (value) return value
  if (String(c.status || "") === "ready_to_bill") return "High"
  if (String(c.status || "") === "blocked_missing_fields") return "Blocked"
  return "Standard"
}

function filterCase(c: Case, filter: string) {
  const synthetic = isSyntheticCase(c)
  const archived = isArchivedCase(c)
  const status = String(c.status || "")
  const podStatus = String(c.pod_status || "")
  const tebraStatus = String(c.tebra_status || "")
  if (filter === "synthetic") return synthetic
  if (archived || synthetic) return false
  if (filter === "all") return true
  if (filter === "awaiting-provider") return status === "provider_signature_requested"
  if (filter === "ready-to-fulfill") return status === "ready_to_fulfill"
  if (filter === "pod-needed") return ["pod_needed", "pod_generated"].includes(status) || ["needed", "signature_required"].includes(podStatus)
  if (filter === "tebra-staged") return status === "tebra_ready" || status === "staged_for_upload" || tebraStatus === "staged_not_submitted" || tebraStatus === "staged_for_upload"
  if (filter === "ready-to-bill") return status === "ready_to_bill"
  return ["created", "intake_received", "missing_docs", "trident_review", "trident_review_complete", "blocked_missing_fields", "provider_packet_generated", "signed_swo_received", "billing_packet_generated", "pod_generated", "delivery_recorded", "signed_pod_received"].includes(status)
}

export function SpearCases() {
  const params = useSearchParams()
  const initialFilter = params.get("filter") || "needs-action"
  const [cases, setCases] = useState<Case[]>([])
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState(initialFilter)
  const [loading, setLoading] = useState(true)
  const [apiStatus, setApiStatus] = useState("CONNECTING")
  const [selected, setSelected] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSwo, setBulkSwo] = useState(false)
  const [bulkPod, setBulkPod] = useState(false)
  const [bulkReference, setBulkReference] = useState("")
  const [bulkNote, setBulkNote] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState("")

  const fetchCases = async () => {
    try {
      const res = await fetch(`${API_BASE}/cases`, { cache: "no-store" })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const data = await res.json()
      setCases(Array.isArray(data) ? data : Array.isArray(data.cases) ? data.cases : [])
      setApiStatus("ONLINE")
    } catch (e) {
      setApiStatus(`OFFLINE: ${e instanceof Error ? e.message : "Unknown error"}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCases()
    const interval = setInterval(fetchCases, 30000)
    return () => clearInterval(interval)
  }, [])

  const visibleCases = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cases
      .filter((c) => filterCase(c, filter))
      .filter((c) => {
        if (!q) return true
        return [c.patient_name, c.provider, c.payer, c.member_id, c.hcpcs, c.icd].map((value) => fmt(value, "")).join(" ").toLowerCase().includes(q)
      })
      .sort((a, b) => (createdDate(b)?.getTime() || 0) - (createdDate(a)?.getTime() || 0))
  }, [cases, filter, search])

  const summary = {
    total: visibleCases.length,
    hiddenSynthetic: cases.filter((c) => isSyntheticCase(c) && filter !== "synthetic").length,
  }

  const visibleIds = visibleCases.map((c) => String(c.id || c.case_id || "")).filter(Boolean)
  const selectedVisible = selected.filter((id) => visibleIds.includes(id))
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length
  const bulkCanSubmit = bulkSwo && bulkPod && bulkReference.trim() && selected.length > 0 && !bulkBusy

  function toggleAllVisible() {
    setSelected((current) => {
      const withoutVisible = current.filter((id) => !visibleIds.includes(id))
      return allVisibleSelected ? withoutVisible : [...withoutVisible, ...visibleIds]
    })
  }

  function toggleCase(caseId: string) {
    setSelected((current) => current.includes(caseId) ? current.filter((id) => id !== caseId) : [...current, caseId])
  }

  async function advanceSelected() {
    if (!bulkCanSubmit) return
    setBulkBusy(true)
    setBulkResult("Advancing selected cases...")
    const res = await fetch(`${API_BASE}/cases/manual-advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        case_ids: selected,
        attest_swo_signed: bulkSwo,
        attest_pod_on_file: bulkPod,
        evidence_location: "tebra",
        evidence_reference: bulkReference,
        note: bulkNote,
      }),
    })
    const payload = await res.json().catch(() => ({}))
    setBulkBusy(false)
    const results = Array.isArray(payload.results) ? payload.results : []
    const failed = results.filter((row: Case) => !row.ok)
    const advanced = results.filter((row: Case) => row.ok)
    setBulkResult(`${advanced.length} advanced, ${failed.length} failed.${failed.length ? ` Failed: ${failed.map((row: Case) => `${fmt(row.case_id)} (${fmt(row.error)})`).join("; ")}` : ""}`)
    if (advanced.length) {
      setSelected((current) => current.filter((id) => !advanced.some((row: Case) => row.case_id === id)))
      await fetchCases()
    }
  }

  if (loading) {
    return <div style={{ padding: "48px 32px", textAlign: "center", color: "#6B7280", fontSize: "13px" }}>Loading cases...</div>
  }

  return (
    <div style={{ background: "#FFFFFF", minHeight: "100%" }}>
      <div style={{ padding: "24px 32px", borderBottom: "1px solid #E5E7EB" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>Cases Queue</h1>
        <p style={{ fontSize: "13px", color: "#6B7280", margin: 0 }}>
          {summary.total} case{summary.total === 1 ? "" : "s"} in {FILTERS.find((f) => f.key === filter)?.label || "Needs Action"}
          {summary.hiddenSynthetic ? ` · ${summary.hiddenSynthetic} synthetic test case${summary.hiddenSynthetic === 1 ? "" : "s"} hidden` : ""}
        </p>
      </div>

      {apiStatus !== "ONLINE" && (
        <div style={{ margin: "16px 32px", padding: "12px 16px", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "8px", fontSize: "13px", color: "#92400E" }}>
          Case queue warning: {apiStatus}
        </div>
      )}

      <div style={{ padding: "20px 32px 0", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search patient, provider, payer, HCPCS..."
          style={{ minWidth: 320, flex: "1 1 320px", border: "1px solid #CBD5E1", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#0F172A" }}
        />
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {FILTERS.map((item) => (
            <Link
              key={item.key}
              href={`/spear/cases?filter=${item.key}`}
              onClick={() => setFilter(item.key)}
              style={{
                textDecoration: "none",
                border: `1px solid ${filter === item.key ? "#2563EB" : "#E2E8F0"}`,
                background: filter === item.key ? "#EFF6FF" : "#FFFFFF",
                color: filter === item.key ? "#1D4ED8" : "#475569",
                borderRadius: "999px",
                padding: "7px 10px",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <button
          disabled={!selected.length}
          onClick={() => {
            setBulkOpen(true)
            setBulkResult("")
          }}
          style={{ border: "none", borderRadius: 8, background: selected.length ? "#0F172A" : "#CBD5E1", color: "#FFFFFF", padding: "9px 12px", fontSize: 12, fontWeight: 800 }}
        >
          Advance selected ({selected.length})
        </button>
      </div>

      {bulkOpen ? (
        <div style={{ margin: "16px 32px 0", border: "1px solid #CBD5E1", borderRadius: 10, background: "#FFFFFF", padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 10 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 16, color: "#0F172A" }}>Advance selected to billing</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#64748B" }}>Applies one Tebra attestation to {selected.length} selected case{selected.length === 1 ? "" : "s"}. The server validates each case individually.</p>
            </div>
            <button onClick={() => setBulkOpen(false)} style={{ border: "1px solid #CBD5E1", borderRadius: 8, background: "#FFFFFF", padding: "6px 9px", fontSize: 12 }}>Close</button>
          </div>
          <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: "#0F172A", marginBottom: 8 }}>
            <input type="checkbox" checked={bulkSwo} onChange={(event) => setBulkSwo(event.target.checked)} />
            Signed SWO is on file in Tebra
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: "#0F172A", marginBottom: 10 }}>
            <input type="checkbox" checked={bulkPod} onChange={(event) => setBulkPod(event.target.checked)} />
            Proof of delivery is on file in Tebra
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(220px, 1fr)", gap: 10, marginBottom: 10 }}>
            <input value={bulkReference} onChange={(event) => setBulkReference(event.target.value)} placeholder="Tebra doc ID / chart note reference" style={{ border: "1px solid #CBD5E1", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0F172A" }} />
            <input value={bulkNote} onChange={(event) => setBulkNote(event.target.value)} placeholder="Optional operator note" style={{ border: "1px solid #CBD5E1", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0F172A" }} />
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
            I attest that the signed SWO and proof of delivery for this order exist in Tebra, that I have personally verified them, and that the items billed match the items prescribed and delivered.
          </p>
          <button disabled={!bulkCanSubmit} onClick={advanceSelected} style={{ border: "none", borderRadius: 8, background: bulkCanSubmit ? "#0F172A" : "#CBD5E1", color: "#FFFFFF", padding: "10px 14px", fontSize: 13, fontWeight: 800 }}>
            {bulkBusy ? "Advancing..." : "Advance selected"}
          </button>
          {bulkResult ? <p style={{ margin: "10px 0 0", fontSize: 12, color: bulkResult.includes("failed") && !bulkResult.includes("0 failed") ? "#B91C1C" : "#166534" }}>{bulkResult}</p> : null}
        </div>
      ) : null}

      <div style={{ padding: "20px 32px 32px" }}>
        {visibleCases.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 32px", color: "#64748B", fontSize: "13px", border: "1px solid #E2E8F0", borderRadius: "10px", background: "#F8FAFC" }}>
            {apiStatus !== "ONLINE" ? "Unable to load cases." : "No cases match this queue."}
          </div>
        ) : (
          <div style={{ border: "1px solid #E5E7EB", borderRadius: "10px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E5E7EB" }}>
                  {["", "Patient Name", "DOB", "Provider", "Payer", "Product / HCPCS", "Laterality", "Current Stage", "Blocker", "Next Action", "Priority", "Age"].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {h ? h : <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible cases" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleCases.map((c) => {
                  const readiness = getSpearNextAction(c as never, [], null, [])
                  const caseId = String(c.id || c.case_id || "")
                  return (
                    <tr key={caseId} style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <td style={{ padding: "12px" }}>
                        <input type="checkbox" checked={selected.includes(caseId)} onChange={() => toggleCase(caseId)} aria-label={`Select ${patientName(c)}`} />
                      </td>
                      <td style={{ padding: "12px", fontSize: "13px", color: "#0F172A", fontWeight: 600 }}>
                        <Link href={`/spear/cases/${caseId}`} style={{ color: "#0F172A", textDecoration: "none" }}>{patientName(c)}</Link>
                        {isSyntheticCase(c) ? <span style={{ marginLeft: 8, fontSize: 10, color: "#92400E", background: "#FEF3C7", borderRadius: 999, padding: "2px 6px" }}>Synthetic</span> : null}
                        <div style={{ fontSize: "11px", color: "#64748B", marginTop: 2 }}>{fmt(c.mrn, "MRN not captured")}</div>
                      </td>
                      <td style={{ padding: "12px", fontSize: "12px", color: "#334155" }}>{fmt(c.dob, "Missing")}</td>
                      <td style={{ padding: "12px", fontSize: "12px", color: "#334155" }}>{fmt(c.provider, "Missing")}</td>
                      <td style={{ padding: "12px", fontSize: "12px", color: "#334155" }}>{fmt(c.payer, "Missing")}<div style={{ fontSize: 11, color: "#64748B" }}>{fmt(c.member_id, "Member ID missing")}</div></td>
                      <td style={{ padding: "12px", fontSize: "12px", color: "#334155" }}>{productLine(c)}</td>
                      <td style={{ padding: "12px", fontSize: "12px", color: "#334155" }}>{fmt(c.laterality, "Missing")}</td>
                      <td style={{ padding: "12px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, padding: "4px 8px", borderRadius: "999px", background: "#EFF6FF", color: "#1D4ED8" }}>
                          {getStageLabel(c.status)}
                        </span>
                      </td>
                      <td style={{ padding: "12px", fontSize: "12px", color: readiness.blockers.length ? "#92400E" : "#64748B" }}>{readiness.blockerSummary}</td>
                      <td style={{ padding: "12px", fontSize: "12px", color: "#0F172A", fontWeight: 600 }}>{readiness.nextActionLabel}</td>
                      <td style={{ padding: "12px", fontSize: "12px", color: "#64748B" }}>{priority(c)}</td>
                      <td style={{ padding: "12px", fontSize: "12px", color: "#64748B" }}>{age(c)}<div style={{ fontSize: 11, color: "#94A3B8" }}>{formatCreated(c)}</div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
