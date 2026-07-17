"use client"

import Link from "next/link"
import React, { useEffect, useMemo, useState } from "react"
import { formatActionLabel, getStageLabel, isSyntheticCase, WORKFLOW_STEPS, type SpearNextAction, type SpearPrimaryAction } from "@/lib/spear-next-action"

type Item = Record<string, unknown>

type Detail = {
  ok: boolean
  case: Item
  documents: Item[]
  artifacts: Item[]
  latest_trident_review: Item | null
  signature_records: Item[]
  pod_record: Item | null
  tebra_export: Item | null
  workflow_events: Item[]
  readiness: SpearNextAction
}

function val(value: unknown, fallback = "Not captured") {
  if (value === null || value === undefined || value === "") return fallback
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback
  return String(value)
}

function date(value: unknown) {
  const raw = String(value || "")
  if (!raw) return "Not captured"
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  const now = new Date()
  if (parsed.toDateString() === now.toDateString()) return `Today, ${parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
  return parsed.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
}

function age(value: unknown) {
  const raw = String(value || "")
  if (!raw) return "Not captured"
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return "Not captured"
  const hours = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 36e5))
  if (hours < 1) return "New"
  if (hours < 24) return `${hours} hours open`
  return `${Math.floor(hours / 24)} days open`
}

function productLine(c: Item) {
  const product = val(c.product ?? c.order_type, "")
  const hcpcs = val(c.final_hcpcs ?? c.operator_approved_hcpcs ?? c.trident_recommended_hcpcs ?? c.source_hcpcs ?? c.hcpcs, "")
  if (product && hcpcs) return `${product} — ${hcpcs}`
  return product || hcpcs || "To be assigned by Trident"
}

function latestByKind(items: Item[], kind: string) {
  return items.filter((item) => item.kind === kind).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null
}

function eventLabel(type: unknown) {
  const labels: Record<string, string> = {
    case_created: "Case created",
    case_posted: "Case posted",
    intake_received: "Intake received",
    extraction_complete: "Extraction complete",
    document_stored: "Document stored",
    trident_review_stored: "Trident review completed",
    artifact_generated: "Artifact generated",
    artifacts_generated: "Provider packet generated",
    provider_packet_generated: "Provider packet generated",
    provider_signature_requested: "Signature request recorded",
    signed_swo_captured: "Signed SWO uploaded",
    signed_pod_captured: "Signed POD uploaded",
    delivery_recorded: "Delivery recorded",
    synthetic_test_archived: "Synthetic test archived",
  }
  return labels[String(type || "")] || String(type || "Workflow event").replace(/_/g, " ")
}

function FieldCard({ title, rows }: { title: string; rows: Array<[string, unknown, string?]> }) {
  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, background: "#FFFFFF", padding: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748B" }}>{title}</h3>
      <div style={{ display: "grid", gap: 9 }}>
        {rows.map(([label, value, fallback]) => (
          <div key={label}>
            <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 600 }}>{val(value, fallback)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DocumentRow({ label, item, required = true, uploaded = false }: { label: string; item: Item | null; required?: boolean; uploaded?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.8fr 1fr 0.7fr", gap: 10, alignItems: "center", borderTop: "1px solid #F1F5F9", padding: "10px 0" }}>
      <div>
        <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11, color: "#64748B" }}>{required ? "Required" : "Optional"}</div>
      </div>
      <span style={{ width: "fit-content", borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 700, background: item ? "#DCFCE7" : "#FEF3C7", color: item ? "#166534" : "#92400E" }}>
        {item ? (uploaded ? "Uploaded" : "Generated") : "Missing"}
      </span>
      <div style={{ fontSize: 12, color: "#475569" }}>
        {item ? <>{val(item.filename, "Unnamed file")}<br /><span style={{ color: "#94A3B8" }}>{date(item.created_at)}</span></> : "Not present"}
      </div>
      {item?.id ? (
        <a href={`/api/spear/${uploaded ? "documents" : "artifacts"}/${item.id}`} style={{ fontSize: 12, color: "#2563EB", fontWeight: 600 }}>Download</a>
      ) : item ? <span style={{ fontSize: 12, color: "#64748B" }}>Stored</span> : <span style={{ fontSize: 12, color: "#CBD5E1" }}>View</span>}
    </div>
  )
}

function UploadPanel({ title, instructions, action, caseId, onDone }: { title: string; instructions: string; action: "upload_signed_swo" | "upload_signed_pod"; caseId: string; onDone: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)

  async function upload() {
    if (!file) {
      setStatus("Choose a PDF or image file first.")
      return
    }
    setBusy(true)
    setStatus("Uploading...")
    const form = new FormData()
    form.append("case_id", caseId)
    form.append("action", action)
    form.append("file", file)
    const res = await fetch("/api/spear/conveyor", { method: "POST", body: form })
    const payload = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !payload.ok) {
      setStatus(payload.error || `Upload failed with HTTP ${res.status}`)
      return
    }
    setStatus(`Stored ${payload.document?.id || "document"} at ${date(payload.document?.created_at)}`)
    setFile(null)
    await onDone()
  }

  return (
    <div style={{ border: "1px solid #BFDBFE", background: "#EFF6FF", borderRadius: 10, padding: 16 }}>
      <h3 style={{ fontSize: 15, color: "#0F172A", margin: "0 0 6px" }}>{title}</h3>
      <p style={{ fontSize: 13, color: "#475569", margin: "0 0 10px" }}>{instructions}</p>
      <p style={{ fontSize: 11, color: "#64748B", margin: "0 0 8px" }}>Accepted file types: PDF, PNG, JPG, JPEG.</p>
      <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => setFile(event.target.files?.[0] || null)} style={{ fontSize: 12, marginBottom: 10 }} />
      {file ? <div style={{ fontSize: 12, color: "#334155", marginBottom: 10 }}>Selected: {file.name}</div> : null}
      <button disabled={busy} onClick={upload} style={{ border: "none", borderRadius: 8, background: busy ? "#94A3B8" : "#2563EB", color: "#FFFFFF", padding: "9px 13px", fontSize: 13, fontWeight: 700 }}>
        {busy ? "Uploading..." : title}
      </button>
      {status ? <p style={{ margin: "10px 0 0", fontSize: 12, color: status.includes("failed") ? "#B91C1C" : "#166534" }}>{status}</p> : null}
    </div>
  )
}

export function SpearCaseWorkspace({ caseId }: { caseId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [busyAction, setBusyAction] = useState("")
  const [chronological, setChronological] = useState(false)
  const [showTech, setShowTech] = useState(false)

  async function load() {
    const res = await fetch(`/api/spear/cases/${encodeURIComponent(caseId)}`, { cache: "no-store" })
    const payload = await res.json().catch(() => ({}))
    if (res.ok) setDetail(payload)
    else setMessage(payload.error || `Unable to load case: HTTP ${res.status}`)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [caseId])

  const c = detail?.case || {}
  const readiness = detail?.readiness
  const latestReview = detail?.latest_trident_review?.review as Item | undefined
  const finalPacket = useMemo(() => latestByKind(detail?.artifacts || [], "final_bill_ready_packet"), [detail])

  async function runAction(action: SpearPrimaryAction) {
    if (!detail || action === "review_intake" || action === "resolve_trident_blockers") {
      setMessage("Update missing fields through intake edit tooling before retrying this step.")
      return
    }
    if (action === "open_final_packet") {
      if (finalPacket) window.open(`/api/spear/artifacts/${finalPacket.id}`, "_blank")
      else setMessage("Final bill-ready packet is not available.")
      return
    }
    if (action === "upload_signed_swo" || action === "upload_signed_pod") return
    setBusyAction(action)
    setMessage(`Running ${formatActionLabel(action)}...`)
    const res = await fetch("/api/spear/conveyor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_id: caseId, action }),
    })
    const payload = await res.json().catch(() => ({}))
    setBusyAction("")
    if (!res.ok || !payload.ok) {
      setMessage(payload.error || `${formatActionLabel(action)} failed with HTTP ${res.status}`)
      return
    }
    setMessage(`${formatActionLabel(action)} complete.`)
    await load()
  }

  async function approveTridentCoding() {
    setBusyAction("approve_trident_coding")
    setMessage("Approving Trident coding recommendation...")
    const res = await fetch("/api/spear/coding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_id: caseId, action: "approve_trident", operator_identity: "spear_operator" }),
    })
    const payload = await res.json().catch(() => ({}))
    setBusyAction("")
    if (!res.ok || !payload.ok) {
      setMessage(payload.error || `Coding approval failed with HTTP ${res.status}`)
      return
    }
    setMessage("Trident coding approved.")
    await load()
  }

  if (loading) return <div style={{ padding: 32, color: "#64748B" }}>Loading case workspace...</div>
  if (!detail || !readiness) return <div style={{ padding: 32, color: "#B91C1C" }}>{message || "Case not found."}</div>

  const events = [...(detail.workflow_events || [])].sort((a, b) => chronological ? String(a.created_at).localeCompare(String(b.created_at)) : String(b.created_at).localeCompare(String(a.created_at)))
  const docs = detail.documents || []
  const artifacts = detail.artifacts || []
  const primary = readiness.primaryAction
  const uploadSwo = primary === "upload_signed_swo"
  const uploadPod = primary === "upload_signed_pod"

  return (
    <div style={{ background: "#FFFFFF", minHeight: "100%", color: "#0F172A" }}>
      <div style={{ padding: "22px 32px", borderBottom: "1px solid #E2E8F0" }}>
        <Link href="/spear/cases" style={{ fontSize: 12, color: "#2563EB", textDecoration: "none", fontWeight: 700 }}>Back to Cases</Link>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: "0 0 8px", fontSize: 28 }}>{val(c.patient_name, "Missing patient")}</h1>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
              {([
                ["DOB", c.dob],
                ["MRN", c.mrn],
                ["Payer", c.payer],
                ["Member ID", c.member_id],
                ["Provider", c.provider],
                ["Provider NPI", c.npi],
                ["Order", productLine(c)],
                ["Laterality", c.laterality],
                ["ICD-10", c.icd],
                ["Order Date", c.order_date],
                ["Current Stage", readiness.stageLabel],
                ["Next Action", readiness.nextActionLabel],
              ] as Array<[string, unknown]>).map(([label, value]) => (
                <div key={String(label)} style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 10px", background: "#F8FAFC" }}>
                  <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 800 }}>{label}</div>
                  <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 700, marginTop: 2 }}>{val(value)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ borderRadius: 999, padding: "4px 9px", background: "#EFF6FF", color: "#1D4ED8", fontSize: 12, fontWeight: 700 }}>{getStageLabel(c.status)}</span>
              <span style={{ borderRadius: 999, padding: "4px 9px", background: "#F8FAFC", color: "#475569", fontSize: 12, fontWeight: 700 }}>{val(c.priority, "Standard")}</span>
              <span style={{ borderRadius: 999, padding: "4px 9px", background: "#F8FAFC", color: "#475569", fontSize: 12, fontWeight: 700 }}>{age(c.created_at)}</span>
              {isSyntheticCase(c) ? <span style={{ borderRadius: 999, padding: "4px 9px", background: "#FEF3C7", color: "#92400E", fontSize: 12, fontWeight: 700 }}>Synthetic Test</span> : null}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 32px", display: "grid", gap: 18 }}>
        <section style={{ border: "1px solid #BFDBFE", background: "#EFF6FF", borderRadius: 12, padding: 18 }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1D4ED8", fontWeight: 800 }}>Current Stage</p>
          <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>{readiness.stageLabel}</h2>
          <p style={{ margin: "0 0 6px", fontSize: 14, color: "#334155" }}><strong>Next Required Action:</strong> {readiness.nextActionLabel}</p>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#475569" }}>{readiness.explanation}</p>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: readiness.blockers.length ? "#92400E" : "#166534" }}><strong>Blockers:</strong> {readiness.blockerSummary}</p>
          {!uploadSwo && !uploadPod ? (
            <button disabled={!readiness.primaryActionEnabled || Boolean(busyAction)} onClick={() => runAction(primary)} style={{ border: "none", borderRadius: 8, background: readiness.primaryActionEnabled ? "#2563EB" : "#94A3B8", color: "#FFFFFF", padding: "10px 14px", fontWeight: 800, fontSize: 13 }}>
              {busyAction ? "Working..." : formatActionLabel(primary)}
            </button>
          ) : null}
          {isSyntheticCase(c) ? <button disabled={Boolean(busyAction)} onClick={() => runAction("archive_synthetic_test")} style={{ marginLeft: 8, border: "1px solid #F59E0B", borderRadius: 8, background: "#FFFBEB", color: "#92400E", padding: "9px 12px", fontWeight: 700, fontSize: 13 }}>Archive Synthetic Test</button> : null}
          {message ? <p style={{ margin: "12px 0 0", fontSize: 12, color: message.includes("failed") || message.includes("Unable") ? "#B91C1C" : "#166534" }}>{message}</p> : null}
        </section>

        <section style={{ border: "1px solid #E2E8F0", borderRadius: 12, background: "#FFFFFF", padding: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#2563EB", fontWeight: 800 }}>Coding & Kit</p>
              <h2 style={{ margin: 0, fontSize: 19, color: "#0F172A" }}>{val(c.carepath_name, "CarePath pending")}</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>Recommended Kit: {val(c.recommended_kit_name, "Pending Trident recommendation")}</p>
            </div>
            <span style={{ borderRadius: 999, padding: "5px 10px", background: c.coding_status === "operator_approved" ? "#DCFCE7" : "#FEF3C7", color: c.coding_status === "operator_approved" ? "#166534" : "#92400E", fontSize: 12, fontWeight: 800 }}>
              {val(c.coding_status, "pending_trident").replace(/_/g, " ")}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            <FieldCard title="Source Coding" rows={[
              ["Source order/product", c.product],
              ["Source HCPCS", c.source_hcpcs, "No source HCPCS. To be assigned by Trident."],
              ["Source ICD-10", c.source_icd, "Not captured from source"],
            ]} />
            <FieldCard title="Trident Recommendation" rows={[
              ["CarePath", c.carepath_name],
              ["Kit", c.recommended_kit_name],
              ["Recommended HCPCS", c.trident_recommended_hcpcs, "Pending Trident"],
              ["Recommended ICD-10", c.trident_recommended_icd, "Uses source ICD unless overridden"],
            ]} />
            <FieldCard title="Final Approved Coding" rows={[
              ["Final HCPCS", c.final_hcpcs, "Awaiting operator approval"],
              ["Final ICD-10", c.final_icd, "Awaiting operator approval"],
              ["Approval status", c.coding_status],
            ]} />
          </div>
          {latestReview ? (
            <div style={{ marginTop: 12, border: "1px solid #F1F5F9", borderRadius: 10, padding: 12, background: "#F8FAFC" }}>
              <div style={{ fontSize: 12, color: "#475569", fontWeight: 700, marginBottom: 6 }}>Trident Notes</div>
              <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>
                <div>Review status: {val(latestReview.review_status)}</div>
                <div>Conflicts: {val(latestReview.coding_conflicts, "None detected")}</div>
                <div>Missing inputs: {val(latestReview.missing_inputs, "None")}</div>
              </div>
            </div>
          ) : null}
          {Array.isArray(c.trident_recommended_hcpcs) && c.trident_recommended_hcpcs.length && c.coding_status !== "operator_approved" ? (
            <button disabled={busyAction === "approve_trident_coding"} onClick={approveTridentCoding} style={{ marginTop: 14, border: "none", borderRadius: 8, background: "#2563EB", color: "#FFFFFF", padding: "10px 14px", fontWeight: 800, fontSize: 13 }}>
              {busyAction === "approve_trident_coding" ? "Approving..." : "Approve Trident Recommendation"}
            </button>
          ) : null}
        </section>

        <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", overflowX: "auto" }}>
            {WORKFLOW_STEPS.map((step, index) => {
              const complete = index < readiness.progressIndex
              const current = index === readiness.progressIndex
              return (
                <React.Fragment key={step}>
                  <div style={{ minWidth: 96, textAlign: "center" }}>
                    <div style={{ margin: "0 auto 6px", width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: complete ? "#2563EB" : current ? "#EFF6FF" : "#FFFFFF", color: complete ? "#FFFFFF" : current ? "#2563EB" : "#94A3B8", border: `2px solid ${complete || current ? "#2563EB" : "#CBD5E1"}`, fontSize: 12, fontWeight: 800 }}>{index + 1}</div>
                    <div style={{ fontSize: 11, color: current ? "#0F172A" : "#64748B", fontWeight: current ? 800 : 600 }}>{step}</div>
                  </div>
                  {index < WORKFLOW_STEPS.length - 1 ? <div style={{ height: 2, width: 24, background: complete ? "#2563EB" : "#E2E8F0" }} /> : null}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {(uploadSwo || uploadPod) ? (
          <UploadPanel
            title={uploadSwo ? "Upload Signed SWO" : "Upload Signed Proof of Delivery"}
            instructions={uploadSwo ? "Upload the signed provider order returned by the provider." : "Upload the patient-signed POD after delivery."}
            action={uploadSwo ? "upload_signed_swo" : "upload_signed_pod"}
            caseId={caseId}
            onDone={load}
          />
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          <FieldCard title="Patient" rows={[["Name", c.patient_name, "Missing"], ["DOB", c.dob, "Missing"], ["MRN", c.mrn], ["Phone", c.phone], ["Email", c.email], ["Address", c.address]]} />
          <FieldCard title="Payer" rows={[["Payer", c.payer, "Missing"], ["Member ID", c.member_id, "Missing"], ["Group Number", c.group_number]]} />
          <FieldCard title="Provider" rows={[["Provider", c.provider, "Missing"], ["NPI", c.npi, "Missing"]]} />
          <FieldCard title="Order" rows={[["Product", c.product, "Not required"], ["HCPCS", c.hcpcs, "Missing"], ["ICD-10", c.icd, "Missing"], ["Laterality", c.laterality, "Missing"], ["Order Date", c.order_date, "Missing"]]} />
        </div>

        <details style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 16, background: "#F8FAFC" }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 800, color: "#334155" }}>Technical Details</summary>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, fontSize: 12, color: "#475569" }}>
            {([
              ["Case ID", c.id],
              ["Order ID", c.order_id],
              ["Patient ID", c.patient_id],
              ["Raw Status", c.status],
              ["Billing Status", c.billing_status],
              ["Trident Status", c.trident_status],
              ["POD Status", c.pod_status],
              ["Tebra Status", c.tebra_status],
              ["Document IDs", docs.map((doc) => doc.id).join(", ")],
              ["Artifact IDs", artifacts.map((artifact) => artifact.id).join(", ")],
            ] as Array<[string, unknown]>).map(([label, value]) => (
              <div key={String(label)}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8", fontWeight: 800 }}>{label}</div>
                <code style={{ wordBreak: "break-word" }}>{val(value)}</code>
                {value ? <button onClick={() => navigator.clipboard.writeText(String(value))} style={{ marginLeft: 6, border: "1px solid #CBD5E1", borderRadius: 5, background: "#FFFFFF", fontSize: 11 }}>Copy</button> : null}
              </div>
            ))}
          </div>
        </details>

        <section style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 16 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Case Blockers</h2>
          {readiness.blockers.length === 0 ? <p style={{ fontSize: 13, color: "#166534", margin: 0 }}>No active blockers for the current stage.</p> : (
            <div style={{ display: "grid", gap: 10 }}>
              {readiness.blockers.map((blocker, index) => (
                <div key={`${blocker.title}-${index}`} style={{ border: "1px solid #FDE68A", background: "#FFFBEB", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, color: "#92400E", fontWeight: 800, textTransform: "uppercase" }}>{blocker.category}</div>
                  <div style={{ fontSize: 14, color: "#0F172A", fontWeight: 800 }}>{blocker.title}</div>
                  <div style={{ fontSize: 13, color: "#475569" }}>{blocker.detail}</div>
                  <div style={{ fontSize: 13, color: "#92400E", marginTop: 4 }}>{blocker.resolution}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 16 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Document Checklist</h2>
          <h3 style={{ fontSize: 12, color: "#64748B", textTransform: "uppercase" }}>Intake</h3>
          <DocumentRow label="Source order" item={latestByKind(docs, "source_intake")} uploaded />
          <DocumentRow label="Intake document" item={latestByKind(docs, "source_intake")} uploaded />
          <DocumentRow label="Extracted fields" item={c.raw_text ? { id: "", filename: "Captured in case record", created_at: c.created_at } : null} required={false} />
          <h3 style={{ fontSize: 12, color: "#64748B", textTransform: "uppercase", marginTop: 18 }}>Provider Packet</h3>
          <DocumentRow label="Coding cover" item={latestByKind(artifacts, "coding_cover")} />
          <DocumentRow label="SWO" item={latestByKind(artifacts, "provider_swo")} />
          <DocumentRow label="Addendum" item={latestByKind(artifacts, "payer_addendum")} />
          <DocumentRow label="Signed SWO" item={latestByKind(docs, "signed_swo")} uploaded />
          <h3 style={{ fontSize: 12, color: "#64748B", textTransform: "uppercase", marginTop: 18 }}>Fulfillment and Billing</h3>
          <DocumentRow label="Billing packet" item={latestByKind(artifacts, "billing_packet")} />
          <DocumentRow label="POD" item={latestByKind(artifacts, "pod")} />
          <DocumentRow label="Signed POD" item={latestByKind(docs, "signed_pod")} uploaded />
          <DocumentRow label="Final bill-ready packet" item={latestByKind(artifacts, "final_bill_ready_packet")} />
        </section>

        <section style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 16 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Trident Review</h2>
          {!latestReview ? <p style={{ fontSize: 13, color: "#64748B" }}>Trident has not reviewed this case.</p> : (
            <div style={{ display: "grid", gap: 8, fontSize: 13, color: "#334155" }}>
              <div><strong>Score:</strong> {val(latestReview.score, "Not scored")}</div>
              <div><strong>Review status:</strong> {val(latestReview.review_status)}</div>
              <div><strong>Billing readiness:</strong> {val(latestReview.billing_readiness)}</div>
              <div><strong>Missing fields:</strong> {val(latestReview.missing_fields, "None")}</div>
              <div><strong>Missing documents:</strong> {val(latestReview.missing_documents, "None")}</div>
              <div><strong>Flags:</strong> {val(latestReview.flags, "None")}</div>
              <div><strong>Recommendations:</strong> {val(latestReview.recommendations, "None")}</div>
              <div><strong>Last reviewed:</strong> {date(detail.latest_trident_review?.created_at)}</div>
            </div>
          )}
        </section>

        <section style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Workflow Timeline</h2>
            <button onClick={() => setChronological((v) => !v)} style={{ border: "1px solid #CBD5E1", background: "#FFFFFF", borderRadius: 8, padding: "6px 9px", fontSize: 12 }}>{chronological ? "Newest First" : "Chronological"}</button>
          </div>
          {events.length === 0 ? <p style={{ fontSize: 13, color: "#64748B" }}>No workflow events stored.</p> : (
            <div style={{ display: "grid", gap: 10 }}>
              {events.map((event) => (
                <div key={String(event.id)} style={{ borderLeft: "3px solid #2563EB", paddingLeft: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>{eventLabel(event.event_type)}</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>{date(event.created_at)} · Actor: {val(event.actor, "SPEAR")}</div>
                  <div style={{ fontSize: 12, color: "#475569" }}>{val((event.payload as Item | undefined)?.status || (event.payload as Item | undefined)?.kind || (event.payload as Item | undefined)?.filename, "Workflow event recorded.")}</div>
                  {showTech ? <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6, padding: 8 }}>{JSON.stringify(event.payload, null, 2)}</pre> : null}
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setShowTech((v) => !v)} style={{ marginTop: 12, border: "1px solid #CBD5E1", background: "#FFFFFF", borderRadius: 8, padding: "6px 9px", fontSize: 12 }}>{showTech ? "Hide" : "Show"} Technical Details</button>
        </section>
      </div>
    </div>
  )
}
