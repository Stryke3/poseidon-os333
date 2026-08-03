"use client"

import { useCallback, useEffect, useState } from "react"

type Item = Record<string, unknown>
type Summary = {
  authorization_status: string
  route?: Item
  gate?: { cleared?: boolean; reason?: string; status?: string }
  validation?: { ok?: boolean; missing?: string[]; blockers?: string[] }
  payer_rule?: Item | null
  destination?: Item | null
  fax_provider?: { configured?: boolean; provider?: string; missing?: string[] }
  packets?: Item[]
}

const certificationKeys = [
  "route_correct", "policy_current", "destination_verified", "criteria_supported",
  "evidence_index_checked", "narrative_grounded", "exact_packet_reviewed",
]

const buttonStyle = { border: 0, borderRadius: 8, background: "#0F172A", color: "#FFFFFF", padding: "9px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" } as const
const inputStyle = { border: "1px solid #CBD5E1", borderRadius: 7, padding: "8px 9px", fontSize: 12, width: "100%", background: "#FFFFFF" } as const

function show(value: unknown, fallback = "Not configured") {
  if (value === null || value === undefined || value === "") return fallback
  if (Array.isArray(value)) return value.join(", ") || fallback
  if (typeof value === "object") return Object.entries(value as Item).map(([key, item]) => `${key.replace(/_/g, " ")}: ${String(item)}`).join(" · ")
  return String(value)
}

export function TridentAuthorizationPanel({ caseId }: { caseId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState("")
  const [evidenceKind, setEvidenceKind] = useState("physician_order")
  const [evidence, setEvidence] = useState<File | null>(null)
  const [reviewerName, setReviewerName] = useState("")
  const [reviewerRole, setReviewerRole] = useState("")
  const [answers, setAnswers] = useState<Record<string, boolean>>({})
  const [disposition, setDisposition] = useState("AUTHORIZED")
  const [payerReference, setPayerReference] = useState("")
  const [noAuthSource, setNoAuthSource] = useState("")
  const [noAuthMethod, setNoAuthMethod] = useState("payer_portal")
  const [noAuthReference, setNoAuthReference] = useState("")
  const [noAuthRepresentative, setNoAuthRepresentative] = useState("")

  const load = useCallback(async () => {
    const response = await fetch(`/api/spear/trident?case_id=${encodeURIComponent(caseId)}`, { cache: "no-store" })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) setSummary(payload)
    else setMessage(payload.error || `Authorization summary failed with HTTP ${response.status}`)
  }, [caseId])

  useEffect(() => { void load() }, [load])

  async function act(action: string, extra: Item = {}) {
    setBusy(action)
    setMessage("")
    const response = await fetch("/api/spear/trident", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_id: caseId, action, ...extra }),
    })
    const payload = await response.json().catch(() => ({}))
    setBusy("")
    setMessage(response.ok && payload.ok ? `${action.replace(/_/g, " ")} completed.` : payload.error || payload.detail || `Action failed with HTTP ${response.status}`)
    await load()
  }

  async function uploadEvidence() {
    if (!evidence) { setMessage("Choose an evidence file first."); return }
    setBusy("upload")
    const form = new FormData()
    form.append("case_id", caseId)
    form.append("kind", evidenceKind)
    form.append("file", evidence)
    const response = await fetch("/api/spear/trident", { method: "POST", body: form })
    const payload = await response.json().catch(() => ({}))
    setBusy("")
    setMessage(response.ok && payload.ok ? `Stored ${payload.document?.filename || "evidence"}.` : payload.error || "Evidence upload failed.")
    if (response.ok) setEvidence(null)
    await load()
  }

  const status = summary?.authorization_status || "RECEIVED"
  const gateCleared = Boolean(summary?.gate?.cleared)
  const allCertified = certificationKeys.every((key) => answers[key])

  return (
    <section id="trident-authorization" style={{ border: `1px solid ${gateCleared ? "#86EFAC" : "#93C5FD"}`, borderRadius: 12, background: gateCleared ? "#F0FDF4" : "#F8FAFC", overflow: "hidden", scrollMarginTop: 24 }}>
      <div style={{ padding: "16px 18px", background: "#0F172A", color: "#FFFFFF", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div><div style={{ fontSize: 10, letterSpacing: ".12em", color: "#93C5FD", fontWeight: 900 }}>TRIDENT AUTHORIZATION</div><h2 style={{ margin: "4px 0 0", fontSize: 19 }}>Authorization-first control gate</h2></div>
        <span style={{ borderRadius: 999, padding: "5px 10px", background: gateCleared ? "#166534" : "#1D4ED8", fontSize: 11, fontWeight: 900 }}>{status.replace(/_/g, " ")}</span>
      </div>

      <div style={{ padding: 18, display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          {[
            ["Gate", gateCleared ? "Cleared" : summary?.gate?.reason],
            ["Procedural route", summary?.route?.title || summary?.route?.route],
            ["Verified destination", summary?.destination],
            ["Fax provider", summary?.fax_provider?.configured ? summary?.fax_provider?.provider : `Blocked: ${show(summary?.fax_provider?.missing)}`],
          ].map(([label, value]) => <div key={String(label)} style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 8, padding: 10 }}><div style={{ fontSize: 9, color: "#64748B", fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>{String(label)}</div><div style={{ fontSize: 12, color: "#0F172A", fontWeight: 700, marginTop: 3, overflowWrap: "anywhere" }}>{show(value)}</div></div>)}
        </div>

        {summary?.validation && !summary.validation.ok ? <div style={{ border: "1px solid #FDE68A", background: "#FFFBEB", borderRadius: 8, padding: 11, color: "#92400E", fontSize: 12 }}><strong>Packet prerequisites:</strong> {show([...(summary.validation.missing || []), ...(summary.validation.blockers || [])], "Review the validation details.")}</div> : null}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={buttonStyle} disabled={Boolean(busy)} onClick={() => act("determine_route")}>1. Determine route</button>
          <button style={buttonStyle} disabled={Boolean(busy)} onClick={() => act("build_packet")}>2. Build review packet</button>
          <button style={buttonStyle} disabled={Boolean(busy)} onClick={() => act("transmit")}>Transmit certified packet</button>
          <button style={buttonStyle} disabled={Boolean(busy)} onClick={() => act("poll_delivery")}>Poll delivery receipt</button>
        </div>

        <details style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 9, padding: 12 }}>
          <summary style={{ fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Evidence and immutable packet versions</summary>
          <div style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 8, marginTop: 12 }}>
            <select value={evidenceKind} onChange={(event) => setEvidenceKind(event.target.value)} style={inputStyle}>{["physician_order", "clinical_notes", "diagnostics", "eligibility_evidence", "pod", "manual_submission_confirmation"].map((kind) => <option key={kind}>{kind}</option>)}</select>
            <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => setEvidence(event.target.files?.[0] || null)} style={inputStyle} />
            <button style={buttonStyle} disabled={Boolean(busy)} onClick={uploadEvidence}>Upload evidence</button>
          </div>
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>{(summary?.packets || []).map((packet) => <div key={String(packet.id)} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, borderTop: "1px solid #F1F5F9", paddingTop: 7 }}><span>v{show((packet.metadata as Item | undefined)?.version, "?")} · {Boolean((packet.metadata as Item | undefined)?.reviewer_certified) ? "Certified" : "Review"} · SHA {show(packet.sha256 || (packet.metadata as Item | undefined)?.sha256, "missing")}</span><a href={`/api/spear/artifacts/${packet.id}`} style={{ color: "#2563EB", fontWeight: 800 }}>Download exact bytes</a></div>)}</div>
        </details>

        <details style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 9, padding: 12 }}>
          <summary style={{ fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Reviewer certification and transmission queue</summary>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}><input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} placeholder="Reviewer full name" style={inputStyle} /><input value={reviewerRole} onChange={(event) => setReviewerRole(event.target.value)} placeholder="Reviewer role" style={inputStyle} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7, margin: "12px 0" }}>{certificationKeys.map((key) => <label key={key} style={{ fontSize: 12, color: "#334155" }}><input type="checkbox" checked={Boolean(answers[key])} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.checked }))} /> {key.replace(/_/g, " ")}</label>)}</div>
          <button style={buttonStyle} disabled={Boolean(busy) || !reviewerName || !reviewerRole || !allCertified} onClick={() => act("certify_and_queue", { reviewer_name: reviewerName, reviewer_role: reviewerRole, answers })}>Certify packet and queue transmission</button>
        </details>

        <details style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 9, padding: 12 }}>
          <summary style={{ fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Affirmatively verify no authorization required</summary>
          <p style={{ fontSize: 11, color: "#64748B" }}>This is a documented payer disposition, never a bypass. Record the source, method, representative when applicable, and confirmation/reference.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 8 }}><input value={noAuthSource} onChange={(event) => setNoAuthSource(event.target.value)} placeholder="Payer policy / portal / call source" style={inputStyle} /><select value={noAuthMethod} onChange={(event) => setNoAuthMethod(event.target.value)} style={inputStyle}>{["payer_portal", "payer_policy", "telephone_verification", "written_confirmation"].map((method) => <option key={method}>{method}</option>)}</select><input value={noAuthReference} onChange={(event) => setNoAuthReference(event.target.value)} placeholder="Confirmation, portal, or policy reference" style={inputStyle} /><input value={noAuthRepresentative} onChange={(event) => setNoAuthRepresentative(event.target.value)} placeholder="Payer representative (if applicable)" style={inputStyle} /></div>
          <button style={{ ...buttonStyle, marginTop: 10 }} disabled={Boolean(busy) || !noAuthSource.trim() || !noAuthReference.trim()} onClick={() => act("verify_no_auth_required", { confirmed: true, source: noAuthSource, method: noAuthMethod, evidence_ref: noAuthReference, representative: noAuthRepresentative })}>Verify and record payer disposition</button>
        </details>

        <details style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 9, padding: 12 }}>
          <summary style={{ fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Record payer disposition</summary>
          <div style={{ display: "grid", gridTemplateColumns: "240px 1fr auto", gap: 8, marginTop: 12 }}><select value={disposition} onChange={(event) => setDisposition(event.target.value)} style={inputStyle}>{["AUTHORIZED", "PARTIALLY_AUTHORIZED", "DENIED", "ADDITIONAL_INFORMATION_REQUESTED", "CONCURRENT_REVIEW_PENDING", "RETRO_REVIEW_PENDING", "CLAIMS_REVIEW_PENDING", "APPEAL_REQUIRED"].map((item) => <option key={item}>{item}</option>)}</select><input value={payerReference} onChange={(event) => setPayerReference(event.target.value)} placeholder="Payer reference / authorization number" style={inputStyle} /><button style={buttonStyle} disabled={Boolean(busy) || !payerReference.trim()} onClick={() => act("record_disposition", { disposition, payer_reference: payerReference })}>Record</button></div>
        </details>

        {message ? <div style={{ fontSize: 12, color: /failed|error|blocked|required/i.test(message) ? "#B91C1C" : "#166534" }}>{busy ? "Working… " : ""}{message}</div> : null}
      </div>
    </section>
  )
}
