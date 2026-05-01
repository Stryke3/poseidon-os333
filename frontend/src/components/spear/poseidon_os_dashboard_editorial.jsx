"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Activity, AlertCircle, AlertTriangle, ArrowUpRight, CheckCircle2, ChevronRight, Download, Eye, FileCheck2, FileText, Lock, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, X } from "lucide-react"

const T = {
  bg: "#f4f3f0",
  bgAlt: "#edecea",
  bgDeep: "#e5e3df",
  bgPaper: "#fbfaf7",
  ink: "#0a0a0a",
  inkMid: "#2a2a2a",
  inkSoft: "#5a5a58",
  inkFaint: "#aaa9a6",
  rule: "#d8d6d2",
  ruleLt: "#eae8e4",
  t1: "#C0392B",
  t2: "#E06020",
  t3: "#D4A020",
  t4: "#4a6fa5",
  t2Soft: "#F7DECF",
}

const FONT_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,200;0,300;0,400;0,500;1,300&family=JetBrains+Mono:wght@300;400;500&display=swap');
.ps-app, .ps-app * { box-sizing: border-box; }
.ps-app { font-family: 'DM Sans', sans-serif; font-size: 14px; line-height: 1.55; color: ${T.inkSoft}; -webkit-font-smoothing: antialiased; }
.ps-display { font-family: 'Syne', sans-serif; letter-spacing: -0.01em; }
.ps-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
.ps-num { font-family: 'Syne', sans-serif; font-feature-settings: 'tnum'; font-variant-numeric: tabular-nums; }
.ps-mono-num { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.ps-app input::placeholder { color: ${T.inkFaint}; }
.ps-app button:focus-visible, .ps-app input:focus-visible { outline: 1px solid ${T.t4}; outline-offset: 2px; }
.ps-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.ps-scroll::-webkit-scrollbar-track { background: transparent; }
.ps-scroll::-webkit-scrollbar-thumb { background: ${T.rule}; border-radius: 4px; }
.ps-scroll::-webkit-scrollbar-thumb:hover { background: ${T.inkFaint}; }
.ps-link { transition: color 160ms ease, border-color 160ms ease, background 160ms ease, transform 160ms ease; }
.ps-card { transition: transform 200ms ease, border-color 200ms ease, background 200ms ease; }
.ps-card:hover { transform: translateY(-1px); }
`

const LIFECYCLE_STAGES = [
  { key: "intake", label: "Intake", no: "01" },
  { key: "ocr_parsed", label: "OCR Parsed", no: "02" },
  { key: "patient_matched", label: "Patient Matched", no: "03" },
  { key: "order_built", label: "Order Built", no: "04" },
  { key: "swo_ready", label: "SWO Ready", no: "05" },
  { key: "dwo_ready", label: "DWO / Addendum", no: "06" },
  { key: "signature_pending", label: "Signature", no: "07" },
  { key: "billing_ready", label: "Billing Cover", no: "08" },
  { key: "packet_exported", label: "Packet Exported", no: "09" },
  { key: "pod_pending", label: "POD / Delivery", no: "10" },
  { key: "closed", label: "Reconciled", no: "11" },
]

const COLUMNS = [
  { key: "new_intake", label: "New Intake", no: "I", accent: T.t4 },
  { key: "needs_review", label: "Needs Review", no: "II", accent: T.t2 },
  { key: "ready_to_generate", label: "Ready to Generate", no: "III", accent: T.t4 },
  { key: "signature_pending", label: "Signature Pending", no: "IV", accent: T.t3 },
  { key: "ready_for_billing", label: "Ready for Billing", no: "V", accent: T.t4 },
  { key: "pod_pending", label: "POD Pending", no: "VI", accent: T.t2 },
  { key: "complete", label: "Complete", no: "VII", accent: T.inkFaint },
]

const riskColor = (r) => ({ low: T.t4, moderate: T.t2, high: T.t1, blocked: T.t1 }[r] || T.inkFaint)
const outputColor = (s) => ({ unavailable: T.inkFaint, blocked: T.t1, eligible: T.t3, generated: T.t4 }[s] || T.inkFaint)
const outputIcon = (s) => ({ unavailable: AlertCircle, blocked: AlertTriangle, eligible: FileCheck2, generated: FileText }[s] || FileText)

const actionForField = (f) =>
  ({
    missing_patient: "Confirm patient identity before document generation",
    missing_dob: "Review packet and source DOB from intake documents",
    missing_provider: "Assign ordering provider before generating output",
    missing_procedure: "Resolve missing procedure before order build",
    missing_laterality: "Confirm laterality before SWO generation",
    missing_payer: "Verify payer before packet render",
    missing_order_date: "Set order date before generation",
    mixed_patient_packet: "Split mixed packet before continuing",
    dob_conflict: "Resolve DOB conflict across source documents",
    procedure_conflict: "Resolve procedure conflict before order build",
    code_conflict: "Resolve code conflict before rendering outputs",
    low_confidence_extraction: "Review low-confidence extraction fields",
  }[f] || "Resolve before generating documents")

const mapStatusToColumn = (caseItem) => {
  if (caseItem.status === "intake") return "new_intake"
  if (caseItem.status === "extract") return "needs_review"
  if (caseItem.status === "review") return caseItem.readyToGenerate ? "ready_to_generate" : "needs_review"
  if (caseItem.status === "generate") return caseItem.completedToday ? "complete" : "ready_to_generate"
  return caseItem.completedToday ? "complete" : "needs_review"
}

const mapStatusToLifecycle = (caseItem) => {
  if (caseItem.status === "intake") return "intake"
  if (caseItem.status === "extract") return "ocr_parsed"
  if (caseItem.status === "review") return caseItem.readyToGenerate ? "swo_ready" : "order_built"
  if (caseItem.status === "generate") return caseItem.completedToday ? "closed" : "dwo_ready"
  return caseItem.completedToday ? "closed" : "order_built"
}

const buildOutputs = (caseItem) => {
  const generated = new Set(caseItem.generatedDocumentTypes || [])
  const hasSwo = Array.from(generated).some((item) => item.toLowerCase().includes("swo"))
  const hasAddendum = Array.from(generated).some((item) => String(item).toUpperCase().includes("ADDENDUM"))
  return [
    {
      key: "swo",
      label: "SWO / Prescription",
      status: hasSwo ? "generated" : caseItem.readyToGenerate ? "eligible" : caseItem.blockers.length ? "blocked" : "unavailable",
    },
    {
      key: "addendum",
      label: "Payer Addendum",
      status: hasAddendum ? "generated" : caseItem.readyToGenerate ? "eligible" : caseItem.blockers.length ? "blocked" : "unavailable",
    },
  ]
}

const mapCase = (caseItem) => {
  return {
    id: caseItem.caseId,
    sourceId: caseItem.id,
    patientName: caseItem.patientName,
    dob: caseItem.dob || null,
    procedure: caseItem.procedure,
    laterality: caseItem.laterality && caseItem.laterality !== "unknown" ? caseItem.laterality.toUpperCase() : "—",
    orderDate: caseItem.orderDate || null,
    providerName: caseItem.provider || "Provider missing",
    payer: caseItem.payer,
    lifecycleStage: mapStatusToLifecycle(caseItem),
    column: mapStatusToColumn(caseItem),
    riskLevel: caseItem.priority === "high" ? "high" : caseItem.priority === "medium" ? "moderate" : "low",
    missingFields: caseItem.blockers.map((blocker) => blocker.code),
    blockers: caseItem.blockers,
    extractionProgress: caseItem.extractionProgress,
    outputs: buildOutputs(caseItem),
    sourceCount: caseItem.sourceCount,
    pdfCount: caseItem.pdfCount,
    generatedDocumentTypes: caseItem.generatedDocumentTypes,
    sourceDocuments: caseItem.sourceDocuments || [],
    generatedDocuments: caseItem.generatedDocuments || [],
    readyToGenerate: caseItem.readyToGenerate,
    status: caseItem.status,
  }
}

const RuleNum = ({ children, color = T.ink, size = 14 }) => (
  <span className="ps-num" style={{ color, fontWeight: 500, fontSize: size, letterSpacing: "-0.02em" }}>
    {children}
  </span>
)

const Label = ({ children, color = T.inkSoft, size = 9.5 }) => (
  <span
    className="ps-mono"
    style={{ color, fontSize: size, letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 400 }}
  >
    {children}
  </span>
)

const Tag = ({ children, color = T.t4, soft }) => (
  <span
    className="ps-mono"
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 7px",
      background: soft || "transparent",
      color,
      fontSize: 9,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      fontWeight: 500,
      border: `1px solid ${color}40`,
      borderRadius: 1,
    }}
  >
    {children}
  </span>
)

const ConfidenceBar = ({ value, label }) => {
  const color = value >= 90 ? T.t4 : value >= 75 ? T.t3 : value >= 50 ? T.t2 : T.t1
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "3px 0" }}>
      <Label size={9}>{label.replace(/_/g, " ")}</Label>
      <div style={{ flex: 1, height: 1, background: T.rule, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: -1,
            height: 3,
            width: `${value}%`,
            background: color,
            transition: "width 700ms ease",
          }}
        />
      </div>
      <span className="ps-mono-num" style={{ width: 32, fontSize: 10, color, fontWeight: 500, textAlign: "right" }}>
        {value}
      </span>
    </div>
  )
}

const Row = ({ k, v, mono = false }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 10.5, color: T.inkSoft, lineHeight: 1.5 }}>
    <span style={{ color: T.inkFaint }}>{k}</span>
    <span
      className={mono ? "ps-mono-num" : ""}
      style={{
        color: T.inkMid,
        marginLeft: 8,
        maxWidth: "60%",
        textAlign: "right",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontSize: mono ? 10 : undefined,
      }}
    >
      {v}
    </span>
  </div>
)

const CommandBar = ({ search, setSearch, onGenerate, onIngest, ingestLoading }) => (
  <header
    style={{
      height: 76,
      padding: "0 32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      background: T.bg,
      borderBottom: `1px solid ${T.rule}`,
      position: "relative",
      zIndex: 30,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span className="ps-mono" style={{ color: T.inkFaint, fontSize: 8, letterSpacing: "0.28em", textTransform: "uppercase" }}>
          StrykeFox Medical
        </span>
        <span className="ps-mono" style={{ color: T.inkSoft, fontSize: 8, letterSpacing: "0.28em", textTransform: "uppercase" }}>
          Trident Engine
        </span>
        <span className="ps-display" style={{ color: T.ink, fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>
          Poseidon OS
        </span>
      </div>

      <div style={{ width: 1, height: 36, background: T.rule }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Label color={T.inkFaint}>Operating Mode</Label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, background: T.t4, display: "inline-block", borderRadius: "50%" }} />
          <span className="ps-display" style={{ color: T.ink, fontSize: 13, fontWeight: 500 }}>
            Document Intelligence · SPEAR Flow
          </span>
        </div>
      </div>
    </div>

    <div style={{ flex: 1, maxWidth: 480, margin: "0 32px", position: "relative" }}>
      <Search size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.inkFaint }} />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Patient, provider, payer, procedure…"
        className="ps-mono"
        style={{
          width: "100%",
          height: 36,
          padding: "0 12px 0 34px",
          fontSize: 11,
          letterSpacing: "0.06em",
          background: T.bgPaper,
          border: `1px solid ${T.rule}`,
          color: T.ink,
          borderRadius: 1,
        }}
      />
    </div>

    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        onClick={onIngest}
        disabled={ingestLoading}
        className="ps-link ps-mono"
        style={{ height: 36, padding: "0 14px", background: "transparent", border: `1px solid ${T.rule}`, color: T.inkMid, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 6, cursor: ingestLoading ? "wait" : "pointer", borderRadius: 1, opacity: ingestLoading ? 0.7 : 1 }}
      >
        <Plus size={11} /> {ingestLoading ? "Ingesting..." : "Ingest PDF"}
      </button>

      <button
        onClick={onGenerate}
        className="ps-link ps-mono"
        style={{
          height: 36,
          padding: "0 16px",
          background: T.ink,
          border: `1px solid ${T.ink}`,
          color: T.bg,
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          borderRadius: 1,
        }}
      >
        Generate Packet <ArrowUpRight size={12} />
      </button>

    </div>
  </header>
)

const LifecycleRail = ({ cases, activeStage, setActiveStage }) => {
  const counts = useMemo(() => {
    const map = {}
    LIFECYCLE_STAGES.forEach((stage) => {
      map[stage.key] = 0
    })
    cases.forEach((caseItem) => {
      map[caseItem.lifecycleStage] = (map[caseItem.lifecycleStage] || 0) + 1
    })
    return map
  }, [cases])

  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        background: T.bgAlt,
        borderRight: `1px solid ${T.rule}`,
        overflowY: "auto",
        padding: "28px 0",
      }}
      className="ps-scroll"
    >
      <div style={{ padding: "0 24px 20px" }}>
        <Label color={T.inkFaint}>SPEAR Flow</Label>
        <div className="ps-display" style={{ marginTop: 6, fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: T.ink, lineHeight: 1.2 }}>
          Lifecycle
          <br />
          Index
        </div>
      </div>

      <div style={{ height: 1, background: T.rule, margin: "0 24px" }} />

      <div style={{ padding: "12px 0" }}>
        {LIFECYCLE_STAGES.map((stage) => {
          const count = counts[stage.key] || 0
          const active = activeStage === stage.key
          const has = count > 0
          return (
            <button
              key={stage.key}
              onClick={() => setActiveStage(active ? null : stage.key)}
              className="ps-link"
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                padding: "10px 24px",
                background: active ? T.bgDeep : "transparent",
                border: "none",
                borderLeft: `2px solid ${active ? T.ink : "transparent"}`,
                cursor: "pointer",
              }}
            >
              <span className="ps-mono-num" style={{ color: active ? T.ink : has ? T.inkSoft : T.inkFaint, fontSize: 10, letterSpacing: "0.1em", width: 18 }}>
                {stage.no}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span className="ps-display" style={{ color: active ? T.ink : has ? T.inkMid : T.inkFaint, fontSize: 13, fontWeight: active ? 600 : 400 }}>
                    {stage.label}
                  </span>
                  <span className="ps-mono-num" style={{ color: has ? T.ink : T.inkFaint, fontSize: 10, fontWeight: 500 }}>
                    {has ? count : "—"}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

const MetricStrip = ({ cases, activeMetric, setActiveMetric }) => {
  const metrics = useMemo(() => {
    const open = cases.filter((caseItem) => caseItem.column !== "complete").length
    const eligible = cases.filter((caseItem) => caseItem.readyToGenerate).length
    const generated = cases.filter((caseItem) => caseItem.generatedDocumentTypes.length > 0).length
    const intake = cases.filter((caseItem) => caseItem.status === "intake").length
    const extracting = cases.filter((caseItem) => caseItem.status === "extract").length
    const review = cases.filter((caseItem) => caseItem.status === "review").length
    const complete = cases.filter((caseItem) => caseItem.completedToday || caseItem.column === "complete").length
    const sourceDocs = cases.reduce((sum, caseItem) => sum + (caseItem.sourceCount || 0), 0)
    const risk = cases.filter((caseItem) => caseItem.riskLevel === "high").length
    return [
      { key: "open", label: "Open", value: open, accent: T.ink, delta: `${open}` },
      { key: "eligible", label: "Eligible", value: eligible, accent: T.t4, delta: `${eligible}` },
      { key: "generated", label: "Generated", value: generated, accent: T.t4, delta: `${generated}` },
      { key: "intake", label: "Intake", value: intake, accent: T.t2, delta: `${intake}` },
      { key: "extract", label: "Extract", value: extracting, accent: T.t2, delta: `${extracting}` },
      { key: "review", label: "Review", value: review, accent: T.t3, delta: `${review}` },
      { key: "sources", label: "Source Docs", value: sourceDocs, accent: T.ink, delta: `${sourceDocs}` },
      { key: "complete", label: "Complete", value: complete, accent: T.inkFaint, delta: `${complete}` },
      { key: "risk", label: "At Risk", value: risk, accent: T.t1, delta: `${risk}` },
    ]
  }, [cases])

  return (
    <div style={{ background: T.bgPaper, borderBottom: `1px solid ${T.rule}`, padding: "20px 32px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 0 }}>
        {metrics.map((metric, index) => {
          const active = activeMetric === metric.key
          return (
            <button
              key={metric.key}
              onClick={() => setActiveMetric(active ? null : metric.key)}
              className="ps-link"
              style={{
                textAlign: "left",
                padding: "4px 18px",
                border: "none",
                borderLeft: index === 0 ? "none" : `1px solid ${active ? T.ink : T.rule}`,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <Label size={9} color={active ? T.ink : T.inkFaint}>
                {metric.label}
              </Label>
              <div className="ps-num" style={{ marginTop: 6, fontSize: 26, fontWeight: 500, color: active ? metric.accent : T.ink, lineHeight: 1 }}>
                {metric.value}
              </div>
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="ps-mono-num" style={{ fontSize: 9.5, color: active ? metric.accent : T.inkFaint }}>
                  {metric.delta}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const PatientCaseCard = ({ caseItem, onClick, selected, accent }) => {
  const totalOutputs = caseItem.outputs.length
  const readyOutputs = caseItem.outputs.filter((output) => output.status === "eligible" || output.status === "generated").length
  const progressPct = totalOutputs ? (readyOutputs / totalOutputs) * 100 : 0
  return (
    <button
      onClick={onClick}
      className="ps-card ps-link"
      style={{
        width: "100%",
        textAlign: "left",
        background: T.bgPaper,
        border: `1px solid ${selected ? T.ink : T.rule}`,
        padding: 0,
        cursor: "pointer",
        position: "relative",
        borderRadius: 1,
        boxShadow: selected ? `2px 2px 0 ${T.ink}` : "none",
      }}
    >
      <div style={{ padding: "8px 12px", background: T.bgAlt, borderBottom: `1px solid ${T.rule}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Label color={T.inkSoft} size={8.5}>
          {caseItem.id}
        </Label>
        <Label color={riskColor(caseItem.riskLevel)} size={8.5}>
          {caseItem.riskLevel}
        </Label>
      </div>

      <div style={{ padding: 12 }}>
        <div className="ps-display" style={{ color: T.ink, fontSize: 15, fontWeight: 600, lineHeight: 1.2, marginBottom: 4 }}>
          {caseItem.patientName}
        </div>
        <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10, lineHeight: 1.4 }}>
          {caseItem.procedure}
          <span className="ps-mono" style={{ color: accent, fontSize: 9, letterSpacing: "0.15em", marginLeft: 6 }}>
            {caseItem.laterality}
          </span>
        </div>

        <div style={{ borderTop: `1px solid ${T.ruleLt}`, paddingTop: 8, marginBottom: 10 }}>
          <Row k="Provider" v={caseItem.providerName} />
          <Row k="Payer" v={caseItem.payer} />
          <Row k="Order Date" v={caseItem.orderDate || "—"} mono={!!caseItem.orderDate} />
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {caseItem.outputs.map((output) => {
            const Icon = outputIcon(output.status)
            const color = outputColor(output.status)
            return (
              <div
                key={output.key}
                className="ps-mono"
                style={{
                  flex: 1,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  border: `1px solid ${color === T.inkFaint ? T.rule : `${color}60`}`,
                  background: color === T.inkFaint ? "transparent" : `${color}10`,
                  fontSize: 8,
                  letterSpacing: "0.15em",
                  color,
                }}
              >
                <Icon size={9} />
                {output.label === "SWO / Prescription" ? "SWO" : "ADD"}
              </div>
            )
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 8, borderTop: `1px solid ${T.ruleLt}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 1, background: T.rule, position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: -1, height: 3, width: `${progressPct}%`, background: accent, transition: "width 700ms ease" }} />
            </div>
            <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between" }}>
              <span className="ps-mono-num" style={{ fontSize: 9, color: T.inkFaint }}>
                {readyOutputs}/{totalOutputs || 1}
              </span>
              {caseItem.missingFields.length > 0 ? (
                <span className="ps-mono-num" style={{ fontSize: 9, color: T.t1 }}>
                  ⚠ {caseItem.missingFields.length}
                </span>
              ) : null}
            </div>
          </div>
          <div className="ps-mono-num" style={{ color: T.ink, fontSize: 11, fontWeight: 500 }}>
            {caseItem.sourceCount} src
          </div>
        </div>
      </div>
    </button>
  )
}

const KanbanBoard = ({ cases, selectedId, setSelectedId }) => (
  <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", background: T.bg }} className="ps-scroll">
    <div style={{ display: "flex", gap: 16, padding: "24px 32px", height: "100%", minWidth: "fit-content" }}>
      {COLUMNS.map((column) => {
        const columnCases = cases.filter((caseItem) => caseItem.column === column.key)
        return (
          <div key={column.key} style={{ display: "flex", flexDirection: "column", width: 270, flexShrink: 0 }}>
            <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${T.ink}` }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="ps-mono" style={{ fontSize: 9, color: column.accent, letterSpacing: "0.15em", fontWeight: 500 }}>
                    {column.no}
                  </span>
                  <span className="ps-display" style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>
                    {column.label}
                  </span>
                </div>
                <span className="ps-mono-num" style={{ fontSize: 11, color: T.ink, fontWeight: 500 }}>
                  {String(columnCases.length).padStart(2, "0")}
                </span>
              </div>
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", paddingRight: 4, paddingBottom: 16 }} className="ps-scroll">
              {columnCases.length === 0 ? (
                <div style={{ border: `1px dashed ${T.rule}`, padding: "20px 12px", textAlign: "center", fontSize: 10, color: T.inkFaint }}>
                  no cases at this stage
                </div>
              ) : null}
              {columnCases.map((caseItem) => (
                <PatientCaseCard key={caseItem.id} caseItem={caseItem} accent={column.accent} selected={selectedId === caseItem.id} onClick={() => setSelectedId(caseItem.id)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  </div>
)

const Section = ({ no, title, children }) => (
  <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.rule}` }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
      <span className="ps-mono" style={{ fontSize: 9, color: T.inkFaint, letterSpacing: "0.15em" }}>
        {no}
      </span>
      <span className="ps-display" style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>
        {title}
      </span>
    </div>
    {children}
  </div>
)

const KV = ({ k, v, mono = false, alert = false }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", fontSize: 11.5, lineHeight: 1.5 }}>
    <span className="ps-mono" style={{ color: T.inkFaint, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase" }}>
      {k}
    </span>
    <span className={mono ? "ps-mono-num" : ""} style={{ color: alert ? T.t1 : T.ink, fontSize: mono ? 11 : 12, fontWeight: 500 }}>
      {v}
    </span>
  </div>
)

const IconBtn = ({ icon: Icon, label, href, download = false }) => (
  <a title={label} href={href} target={download ? undefined : "_blank"} rel={download ? undefined : "noreferrer"} download={download || undefined} className="ps-link" style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: `1px solid ${T.rule}`, cursor: "pointer", borderRadius: 1 }}>
    <Icon size={11} color={T.inkMid} />
  </a>
)

const FieldInput = ({ label, value, onChange, type = "text", placeholder = "—" }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <Label size={8.5} color={T.inkFaint}>{label}</Label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="ps-mono"
      style={{ height: 34, padding: "0 10px", fontSize: 10.5, letterSpacing: "0.04em", background: T.bgPaper, border: `1px solid ${T.rule}`, color: T.ink, borderRadius: 1 }}
    />
  </label>
)

const CaseIntelligencePanel = ({ caseData, onClose, onGenerate, editableFields, onFieldChange, onSaveFields, onDeleteCase, fieldSaving, fieldError, deleteLoading }) => {
  if (!caseData) return null

  return (
    <aside style={{ width: 420, flexShrink: 0, background: T.bgPaper, borderLeft: `1px solid ${T.rule}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "24px 24px 20px", borderBottom: `1px solid ${T.rule}`, background: T.bgAlt, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Label size={9} color={T.inkFaint}>
              {caseData.id}
            </Label>
            <Tag color={riskColor(caseData.riskLevel)}>{caseData.riskLevel} risk</Tag>
          </div>
          <h2 className="ps-display" style={{ fontSize: 22, fontWeight: 700, color: T.ink, lineHeight: 1.15, marginBottom: 6 }}>
            {caseData.patientName}
          </h2>
          <div className="ps-mono" style={{ fontSize: 10, color: T.inkSoft, letterSpacing: "0.1em" }}>
            DOB {caseData.dob || "—"} · {caseData.laterality}
          </div>
        </div>
        <button onClick={onClose} className="ps-link" style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: `1px solid ${T.rule}`, cursor: "pointer", borderRadius: 1 }}>
          <X size={13} color={T.inkMid} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }} className="ps-scroll">
        <Section no="01" title="Surgical Context">
          <KV k="Procedure" v={caseData.procedure} />
          <KV k="Order Date" v={caseData.orderDate || "— missing"} alert={!caseData.orderDate} mono={!!caseData.orderDate} />
          <KV k="Provider" v={caseData.providerName} />
          <KV k="Primary" v={caseData.payer} />
        </Section>

        <Section no="02" title="OCR Confidence">
          <ConfidenceBar label="extraction progress" value={caseData.extractionProgress} />
        </Section>

        <Section no="03" title="Case Fields">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FieldInput label="DOB" type="date" value={editableFields.dob} onChange={(event) => onFieldChange("dob", event.target.value)} />
            <FieldInput label="Order Date" type="date" value={editableFields.orderDate} onChange={(event) => onFieldChange("orderDate", event.target.value)} />
            <FieldInput label="Provider" value={editableFields.providerName} onChange={(event) => onFieldChange("providerName", event.target.value)} />
            <FieldInput label="Payer" value={editableFields.payer} onChange={(event) => onFieldChange("payer", event.target.value)} />
            <FieldInput label="Procedure" value={editableFields.procedure} onChange={(event) => onFieldChange("procedure", event.target.value)} />
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Label size={8.5} color={T.inkFaint}>Laterality</Label>
              <select value={editableFields.laterality} onChange={(event) => onFieldChange("laterality", event.target.value)} className="ps-mono" style={{ height: 34, padding: "0 10px", fontSize: 10.5, letterSpacing: "0.04em", background: T.bgPaper, border: `1px solid ${T.rule}`, color: T.ink, borderRadius: 1 }}>
                <option value="">Unknown</option>
                <option value="RT">RT</option>
                <option value="LT">LT</option>
                <option value="BILATERAL">Bilateral</option>
              </select>
            </label>
          </div>
          {fieldError ? <div style={{ marginTop: 12, padding: "12px 16px", background: "#f4d9d4", borderLeft: `2px solid ${T.t1}`, fontSize: 11, color: T.inkMid, lineHeight: 1.6 }}>{fieldError}</div> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={onSaveFields} disabled={fieldSaving} className="ps-link ps-mono" style={{ flex: 1, height: 36, background: T.ink, color: T.bg, border: `1px solid ${T.ink}`, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: fieldSaving ? "wait" : "pointer", borderRadius: 1, opacity: fieldSaving ? 0.7 : 1 }}>
              <Save size={12} /> {fieldSaving ? "Saving..." : "Save Fields"}
            </button>
            <button onClick={onDeleteCase} disabled={deleteLoading} className="ps-link ps-mono" style={{ height: 36, padding: "0 12px", background: "transparent", color: T.t1, border: `1px solid ${T.t1}55`, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: deleteLoading ? "wait" : "pointer", borderRadius: 1, opacity: deleteLoading ? 0.7 : 1 }}>
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </Section>

        {caseData.missingFields.length ? (
          <Section no="04" title="Risk → Action">
            {caseData.missingFields.map((field, index) => (
              <div key={field} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderTop: index === 0 ? "none" : `1px solid ${T.ruleLt}` }}>
                <span className="ps-mono" style={{ fontSize: 8, color: T.t1, letterSpacing: "0.18em", paddingTop: 2, width: 12 }}>
                  ↳
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ps-display" style={{ fontSize: 12, color: T.ink, fontWeight: 500, marginBottom: 3, textTransform: "capitalize" }}>
                    Missing: {field.replace(/_/g, " ")}
                  </div>
                  <div style={{ fontSize: 11, color: T.inkSoft, lineHeight: 1.5 }}>{actionForField(field)}</div>
                </div>
                <ChevronRight size={12} color={T.inkFaint} style={{ marginTop: 4, flexShrink: 0 }} />
              </div>
            ))}
          </Section>
        ) : null}

        <Section no={caseData.missingFields.length ? "05" : "04"} title="Packet Context">
          <KV k="Source Documents" v={String(caseData.sourceCount)} mono />
          <KV k="PDF Count" v={String(caseData.pdfCount)} mono />
          <KV k="Workflow State" v={caseData.status} mono />
          <KV k="Ready to Generate" v={caseData.readyToGenerate ? "yes" : "no"} mono />
        </Section>

        <Section no={caseData.missingFields.length ? "06" : "05"} title="Uploaded PDFs">
          {caseData.sourceDocuments.length ? (
            caseData.sourceDocuments.map((doc, index) => (
              <div key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: index > 0 ? `1px solid ${T.ruleLt}` : "none" }}>
                <div>
                  <div className="ps-display" style={{ fontSize: 12, color: T.ink, fontWeight: 500 }}>{doc.filename}</div>
                  <Label size={8.5} color={T.inkFaint}>{doc.category}</Label>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <IconBtn icon={Eye} label="view pdf" href={`/api/lite/patients/${caseData.sourceId}/documents/${doc.id}/file`} />
                  <IconBtn icon={Download} label="download pdf" href={`/api/lite/patients/${caseData.sourceId}/documents/${doc.id}/file?download=1`} download />
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 11, color: T.inkSoft }}>No uploaded PDFs.</div>
          )}
        </Section>

        <Section no={caseData.missingFields.length ? "07" : "06"} title="Generated Documents">
          {caseData.outputs.map((output, index) => {
            const color = outputColor(output.status)
            const Icon = outputIcon(output.status)
            const generatedDoc = caseData.generatedDocuments.find((doc) => doc.type === (output.key === "swo" ? "SWO" : "ADDENDUM"))
            return (
              <div key={output.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: index > 0 ? `1px solid ${T.ruleLt}` : "none" }}>
                <Icon size={14} color={color} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ps-display" style={{ fontSize: 12, color: T.ink, fontWeight: 500 }}>{output.label}</div>
                  <Label size={8.5} color={color}>{output.status}</Label>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {output.status === "generated" && generatedDoc ? (
                    <>
                      <IconBtn icon={Eye} label="view" href={`/trident/cases/${caseData.sourceId}/generated/${generatedDoc.id}`} />
                      <IconBtn icon={Download} label="download" href={`/api/lite/patients/${caseData.sourceId}/generated/${generatedDoc.id}/file`} download />
                    </>
                  ) : null}
                  {output.status === "eligible" ? <span className="ps-mono" style={{ fontSize: 8.5, color: T.inkFaint, letterSpacing: "0.12em" }}>ready</span> : null}
                </div>
              </div>
            )
          })}
        </Section>

        <Section no={caseData.missingFields.length ? "08" : "07"} title="Blockers">
          {caseData.blockers.length ? (
            caseData.blockers.map((blocker, index) => (
              <div key={blocker.code} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: index > 0 ? `1px solid ${T.ruleLt}` : "none" }}>
                <div>
                  <div className="ps-display" style={{ fontSize: 12, color: T.ink, fontWeight: 500 }}>{blocker.label}</div>
                  <Label size={8.5} color={blocker.severity === "blocking" ? T.t1 : T.t2}>{blocker.source || blocker.reviewAction}</Label>
                </div>
                <Tag color={blocker.severity === "blocking" ? T.t1 : T.t2}>{blocker.severity}</Tag>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 11, color: T.inkSoft }}>No active blockers.</div>
          )}
        </Section>
      </div>

      <div style={{ padding: 20, borderTop: `1px solid ${T.rule}`, background: T.bgAlt }}>
        <button onClick={onGenerate} className="ps-link ps-mono" style={{ width: "100%", height: 42, background: T.ink, color: T.bg, border: `1px solid ${T.ink}`, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", borderRadius: 1 }}>
          Generate Patient Packet <ArrowUpRight size={13} />
        </button>
      </div>
    </aside>
  )
}

const GeneratePacketModal = ({ caseData, onClose, onGenerate, loading, error }) => {
  const [selected, setSelected] = useState({ swo: true, addendum: true })

  if (!caseData) return null

  const ready = {
    swo: caseData.sourceCount > 0,
    addendum: caseData.sourceCount > 0,
  }

  const docs = [
    { key: "swo", label: "SWO / Prescription", req: ["Patient", "DOB", "Provider", "Procedure", "Payer", "Order Date"] },
    { key: "addendum", label: "Payer Addendum", req: ["Review complete", "No blocking conflicts"] },
  ]

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,10,10,0.55)", backdropFilter: "blur(8px)", padding: 24 }}>
      <div onClick={(event) => event.stopPropagation()} style={{ width: "100%", maxWidth: 640, background: T.bgPaper, border: `1px solid ${T.ink}`, boxShadow: "4px 4px 0 rgba(10,10,10,0.5)", borderRadius: 1, overflow: "hidden" }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.ink}`, background: T.bgAlt, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <Label color={T.t3}>Generate Packet</Label>
            <h2 className="ps-display" style={{ fontSize: 24, fontWeight: 700, color: T.ink, marginTop: 6 }}>{caseData.patientName}</h2>
            <div className="ps-mono" style={{ fontSize: 10, color: T.inkSoft, letterSpacing: "0.12em", marginTop: 4 }}>
              {caseData.id} · {caseData.procedure} · {caseData.payer}
            </div>
          </div>
          <button onClick={onClose} className="ps-link" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: `1px solid ${T.rule}`, cursor: "pointer", borderRadius: 1 }}>
            <X size={14} color={T.ink} />
          </button>
        </div>

        <div style={{ padding: "24px 28px", maxHeight: "60vh", overflowY: "auto" }} className="ps-scroll">
          <Label size={9} color={T.inkFaint}>Select outputs</Label>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {docs.map((doc) => {
              const isReady = ready[doc.key]
              const isSelected = selected[doc.key]
              return (
                <button
                  key={doc.key}
                  disabled={!isReady}
                  onClick={() => setSelected((current) => ({ ...current, [doc.key]: !current[doc.key] }))}
                  className="ps-link"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "14px 16px",
                    background: isSelected && isReady ? T.bgAlt : "transparent",
                    border: `1px solid ${isSelected && isReady ? T.ink : T.rule}`,
                    cursor: isReady ? "pointer" : "not-allowed",
                    opacity: isReady ? 1 : 0.5,
                    borderRadius: 1,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 14, height: 14, background: isSelected && isReady ? T.ink : "transparent", border: `1px solid ${isSelected && isReady ? T.ink : T.inkFaint}`, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 1 }}>
                        {isSelected && isReady ? <CheckCircle2 size={9} color={T.bg} /> : null}
                      </div>
                      <span className="ps-display" style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{doc.label}</span>
                    </div>
                    <Tag color={isReady ? T.t4 : T.t2}>{isReady ? "ready" : "needs review"}</Tag>
                  </div>
                  <div className="ps-mono" style={{ fontSize: 9, color: T.inkFaint, letterSpacing: "0.1em", paddingLeft: 24, lineHeight: 1.5 }}>
                    Requires: {doc.req.join(" · ")}
                  </div>
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 18, padding: "14px 16px", background: T.t2Soft, borderLeft: `2px solid ${T.t2}`, fontSize: 11, color: T.inkMid, lineHeight: 1.6 }}>
            Generated documents are for workflow preparation only. Human review remains required before external submission.
          </div>
          {error ? (
            <div style={{ marginTop: 12, padding: "12px 16px", background: "#f4d9d4", borderLeft: `2px solid ${T.t1}`, fontSize: 11, color: T.inkMid, lineHeight: 1.6 }}>
              {error}
            </div>
          ) : null}
        </div>

        <div style={{ padding: "16px 28px", borderTop: `1px solid ${T.rule}`, background: T.bgAlt, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="ps-mono" style={{ fontSize: 10, color: T.inkSoft, letterSpacing: "0.12em" }}>
            <span style={{ color: T.ink, fontWeight: 500 }}>{Object.values(selected).filter(Boolean).length}</span> outputs selected
          </span>
          <button
            onClick={() => onGenerate(Object.entries(selected).filter(([, isSelected]) => isSelected).map(([key]) => key))}
            disabled={loading || !Object.values(selected).some(Boolean)}
            className="ps-link ps-mono"
            style={{ padding: "0 18px", height: 36, background: T.ink, color: T.bg, border: `1px solid ${T.ink}`, fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 500, cursor: loading ? "wait" : "pointer", borderRadius: 1, display: "inline-flex", alignItems: "center", gap: 8, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Generating..." : "Render Packet"} <ArrowUpRight size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PoseidonOsDashboardEditorial({ initialCases }) {
  const router = useRouter()
  const fileInputRef = useRef(null)
  const mappedInitialCases = useMemo(() => initialCases.map(mapCase), [initialCases])
  const [caseRecords, setCaseRecords] = useState(mappedInitialCases)
  const [search, setSearch] = useState("")
  const [activeStage, setActiveStage] = useState(null)
  const [activeMetric, setActiveMetric] = useState(null)
  const [selectedId, setSelectedId] = useState(mappedInitialCases[0]?.id || null)
  const [modalOpen, setModalOpen] = useState(false)
  const [generationLoading, setGenerationLoading] = useState(false)
  const [generationError, setGenerationError] = useState("")
  const [generationNotice, setGenerationNotice] = useState("")
  const [ingestLoading, setIngestLoading] = useState(false)
  const [ingestError, setIngestError] = useState("")
  const [ingestNotice, setIngestNotice] = useState("")
  const [fieldSaving, setFieldSaving] = useState(false)
  const [fieldError, setFieldError] = useState("")
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [editableFields, setEditableFields] = useState({
    dob: "",
    orderDate: "",
    providerName: "",
    payer: "",
    procedure: "",
    laterality: "",
  })

  const filtered = useMemo(() => {
    let cases = caseRecords
    if (search.trim()) {
      const query = search.toLowerCase()
      cases = cases.filter(
        (caseItem) =>
          caseItem.patientName.toLowerCase().includes(query) ||
          caseItem.providerName.toLowerCase().includes(query) ||
          caseItem.payer.toLowerCase().includes(query) ||
          caseItem.procedure.toLowerCase().includes(query) ||
          caseItem.id.toLowerCase().includes(query) ||
          caseItem.generatedDocumentTypes.some((item) => item.toLowerCase().includes(query)),
      )
    }
    if (activeStage) {
      cases = cases.filter((caseItem) => caseItem.lifecycleStage === activeStage)
    }
    if (activeMetric) {
      const predicates = {
        open: (caseItem) => caseItem.column !== "complete",
        eligible: (caseItem) => caseItem.readyToGenerate,
        generated: (caseItem) => caseItem.generatedDocumentTypes.length > 0,
        intake: (caseItem) => caseItem.status === "intake",
        extract: (caseItem) => caseItem.status === "extract",
        review: (caseItem) => caseItem.status === "review",
        sources: (caseItem) => caseItem.sourceCount > 0,
        complete: (caseItem) => caseItem.completedToday || caseItem.column === "complete",
        risk: (caseItem) => caseItem.riskLevel === "high",
      }
      cases = cases.filter(predicates[activeMetric] || (() => true))
    }
    return cases
  }, [activeMetric, activeStage, caseRecords, search])

  useEffect(() => {
    setCaseRecords(mappedInitialCases)
  }, [mappedInitialCases])

  useEffect(() => {
    if (!filtered.length) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !filtered.some((caseItem) => caseItem.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  useEffect(() => {
    if (!generationNotice) return
    const timer = window.setTimeout(() => setGenerationNotice(""), 4000)
    return () => window.clearTimeout(timer)
  }, [generationNotice])

  useEffect(() => {
    if (!ingestNotice) return
    const timer = window.setTimeout(() => setIngestNotice(""), 5000)
    return () => window.clearTimeout(timer)
  }, [ingestNotice])

  useEffect(() => {
    if (!ingestError) return
    const timer = window.setTimeout(() => setIngestError(""), 6000)
    return () => window.clearTimeout(timer)
  }, [ingestError])

  const selectedCase = useMemo(() => filtered.find((caseItem) => caseItem.id === selectedId) || caseRecords.find((caseItem) => caseItem.id === selectedId) || null, [caseRecords, filtered, selectedId])

  async function reloadCase(sourceId) {
    const response = await fetch(`/api/trident/cases/${sourceId}`, { cache: "no-store" })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.id) {
      throw new Error(payload?.message || payload?.error || "Unable to reload case")
    }
    const nextCase = mapCase(payload)
    setCaseRecords((current) => current.map((item) => item.sourceId === sourceId ? nextCase : item))
    setSelectedId(nextCase.id)
    return nextCase
  }

  useEffect(() => {
    if (!selectedCase) return
    setEditableFields({
      dob: selectedCase.dob || "",
      orderDate: selectedCase.orderDate || "",
      providerName: selectedCase.providerName === "Provider missing" ? "" : selectedCase.providerName || "",
      payer: selectedCase.payer === "Payer missing" ? "" : selectedCase.payer || "",
      procedure: selectedCase.procedure || "",
      laterality: selectedCase.laterality === "—" ? "" : selectedCase.laterality || "",
    })
    setFieldError("")
  }, [selectedCase])

  async function handleGenerate(outputs) {
    if (!selectedCase || !outputs.length) return
    setGenerationLoading(true)
    setGenerationError("")
    try {
      const docTypes = outputs.map((output) => {
        if (output === "swo") return "SWO"
        return "ADDENDUM"
      })
      const response = await fetch(`/api/trident/cases/${selectedCase.sourceId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_types: docTypes }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.results?.find((item) => item.status >= 400)?.body || payload?.message || "Generation failed")
      }
      await reloadCase(selectedCase.sourceId)
      setModalOpen(false)
      setGenerationNotice(`Generated ${docTypes.join(" + ")} for ${selectedCase.patientName}.`)
      router.refresh()
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Generation failed")
    } finally {
      setGenerationLoading(false)
    }
  }

  function handleFieldChange(key, value) {
    setEditableFields((current) => ({ ...current, [key]: value }))
  }

  async function handleSaveFields() {
    if (!selectedCase) return
    setFieldSaving(true)
    setFieldError("")
    try {
      const response = await fetch(`/api/trident/cases/${selectedCase.sourceId}/fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editableFields),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.detail || payload?.message || payload?.error || "Unable to save fields")
      }
      await reloadCase(selectedCase.sourceId)
      setGenerationNotice(`Updated case ${selectedCase.id}.`)
      router.refresh()
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : "Unable to save fields")
    } finally {
      setFieldSaving(false)
    }
  }

  async function handleDeleteCase() {
    if (!selectedCase) return
    if (!window.confirm(`Delete case ${selectedCase.id}?`)) return
    setDeleteLoading(true)
    setFieldError("")
    try {
      const response = await fetch(`/api/trident/cases/${selectedCase.sourceId}`, { method: "DELETE" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.detail || payload?.message || payload?.error || "Unable to delete case")
      }
      setCaseRecords((current) => current.filter((item) => item.sourceId !== selectedCase.sourceId))
      setSelectedId(null)
      setGenerationNotice(`Deleted case ${selectedCase.id}.`)
      router.refresh()
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : "Unable to delete case")
    } finally {
      setDeleteLoading(false)
    }
  }

  function openIngestPicker() {
    if (ingestLoading) return
    fileInputRef.current?.click()
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    setIngestLoading(true)
    setIngestError("")
    setIngestNotice("")

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/trident/intake", {
        method: "POST",
        body: formData,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "PDF ingest failed")
      }

      setIngestNotice(`Ingested ${payload?.patientName || file.name}. Case ${payload?.caseId || ""}`.trim())
      router.refresh()
    } catch (error) {
      setIngestError(error instanceof Error ? error.message : "PDF ingest failed")
    } finally {
      setIngestLoading(false)
    }
  }

  return (
    <div className="ps-app" style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column", background: T.bg, color: T.ink, overflow: "hidden" }}>
      <style>{FONT_STYLES}</style>
      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={handleFileChange} style={{ display: "none" }} />
      <CommandBar search={search} setSearch={setSearch} onGenerate={() => setModalOpen(true)} onIngest={openIngestPicker} ingestLoading={ingestLoading} />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <LifecycleRail cases={caseRecords} activeStage={activeStage} setActiveStage={setActiveStage} />

        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <MetricStrip cases={caseRecords} activeMetric={activeMetric} setActiveMetric={setActiveMetric} />

          {ingestError ? (
            <div style={{ padding: "10px 32px", borderBottom: `1px solid ${T.rule}`, background: "#f4d9d4", color: T.ink, fontSize: 11 }}>
              {ingestError}
            </div>
          ) : null}

          {ingestNotice ? (
            <div style={{ padding: "10px 32px", borderBottom: `1px solid ${T.rule}`, background: T.bgAlt, color: T.ink, fontSize: 11 }}>
              {ingestNotice}
            </div>
          ) : null}

          {generationNotice ? (
            <div style={{ padding: "10px 32px", borderBottom: `1px solid ${T.rule}`, background: T.bgAlt, color: T.ink, fontSize: 11 }}>
              {generationNotice}
            </div>
          ) : null}

          {activeStage || activeMetric || search ? (
            <div style={{ padding: "10px 32px", borderBottom: `1px solid ${T.rule}`, background: T.bgAlt, display: "flex", alignItems: "center", gap: 10 }}>
              <Label size={9} color={T.inkFaint}>Filter</Label>
              {search ? <Tag color={T.t4}>search · {search}</Tag> : null}
              {activeStage ? <Tag color={T.t4}>stage · {LIFECYCLE_STAGES.find((stage) => stage.key === activeStage)?.label}</Tag> : null}
              {activeMetric ? <Tag color={T.t4}>metric · {activeMetric}</Tag> : null}
              <span className="ps-mono-num" style={{ marginLeft: "auto", fontSize: 10, color: T.inkSoft }}>{filtered.length} of {caseRecords.length}</span>
              <button onClick={() => { setActiveStage(null); setActiveMetric(null); setSearch("") }} className="ps-link ps-mono" style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", padding: "4px 10px", background: "transparent", border: `1px solid ${T.rule}`, color: T.inkMid, cursor: "pointer", borderRadius: 1 }}>
                Clear
              </button>
            </div>
          ) : null}

          <KanbanBoard cases={filtered} selectedId={selectedId} setSelectedId={setSelectedId} />

          <div style={{ padding: "14px 32px", borderTop: `1px solid ${T.rule}`, background: T.bgPaper, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
              <span className="ps-mono" style={{ fontSize: 8.5, color: T.inkFaint, letterSpacing: "0.22em", textTransform: "uppercase" }}>
                <Lock size={9} style={{ display: "inline", marginRight: 6, verticalAlign: "middle", color: T.t4 }} />
                PHI Secure
              </span>
              <span className="ps-mono" style={{ fontSize: 8.5, color: T.inkFaint, letterSpacing: "0.22em", textTransform: "uppercase" }}>
                <ShieldCheck size={9} style={{ display: "inline", marginRight: 6, verticalAlign: "middle", color: T.t4 }} />
                Audit Active
              </span>
              <span className="ps-mono" style={{ fontSize: 8.5, color: T.inkFaint, letterSpacing: "0.22em", textTransform: "uppercase" }}>
                <Activity size={9} style={{ display: "inline", marginRight: 6, verticalAlign: "middle", color: T.t4 }} />
                Trident Live
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span className="ps-mono" style={{ fontSize: 8.5, color: T.inkFaint, letterSpacing: "0.22em", textTransform: "uppercase" }}>
                StrykeFox Medical
              </span>
              <span style={{ color: T.rule }}>·</span>
              <span className="ps-mono" style={{ fontSize: 8.5, color: T.inkSoft, letterSpacing: "0.22em", textTransform: "uppercase" }}>
                Trident Engine
              </span>
            </div>
          </div>
        </main>

        <CaseIntelligencePanel
          caseData={selectedCase}
          onClose={() => setSelectedId(null)}
          onGenerate={() => setModalOpen(true)}
          editableFields={editableFields}
          onFieldChange={handleFieldChange}
          onSaveFields={handleSaveFields}
          onDeleteCase={handleDeleteCase}
          fieldSaving={fieldSaving}
          fieldError={fieldError}
          deleteLoading={deleteLoading}
        />
      </div>

      {modalOpen ? <GeneratePacketModal caseData={selectedCase} onClose={() => { setModalOpen(false); setGenerationError("") }} onGenerate={handleGenerate} loading={generationLoading} error={generationError} /> : null}
    </div>
  )
}
