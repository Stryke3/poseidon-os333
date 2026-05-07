"use client"

import React, { useMemo, useState } from "react"
import { Activity, AlertCircle, AlertTriangle, ArrowUpRight, CheckCircle2, ChevronRight, Download, Eye, FileCheck2, FileText, Lock, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, X, TrendingUp, TrendingDown, DollarSign, Calendar, User, FileSearch } from "lucide-react"

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

const STATUS_COLORS = {
  intake: T.t4,
  review: T.t2,
  generate: T.t3,
  signed: T.t4,
  billed: T.inkFaint,
  blocked: T.t1,
}

const riskColor = (r) => ({ low: T.t4, moderate: T.t2, high: T.t1, blocked: T.t1 }[r] || T.inkFaint)

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

const StatusBadge = ({ status }) => {
  const color = STATUS_COLORS[status] || T.inkFaint
  return (
    <Tag color={color} soft={`${color}20`}>
      {status}
    </Tag>
  )
}

const RiskBadge = ({ risk }) => {
  const color = riskColor(risk)
  return (
    <Tag color={color} soft={`${color}20`}>
      {risk} risk
    </Tag>
  )
}

const RevenueAtRiskBadge = ({ atRisk }) => {
  if (!atRisk) return null
  return (
    <Tag color={T.t1} soft={`${T.t1}20`}>
      Revenue at Risk
    </Tag>
  )
}

export function MasterTracker({ initialData }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedRisk, setSelectedRisk] = useState("all")

  const filteredData = useMemo(() => {
    return initialData.filter((item) => {
      const matchesSearch = searchQuery === "" || 
        item.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.procedure?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.payer?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus = selectedStatus === "all" || item.status === selectedStatus
      const matchesRisk = selectedRisk === "all" || item.riskLevel === selectedRisk

      return matchesSearch && matchesStatus && matchesRisk
    })
  }, [initialData, searchQuery, selectedStatus, selectedRisk])

  const stats = useMemo(() => {
    const total = initialData.length
    const byStatus = initialData.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {})
    const atRisk = initialData.filter(item => item.revenueAtRisk).length
    const highRisk = initialData.filter(item => item.riskLevel === "high").length

    return { total, byStatus, atRisk, highRisk }
  }, [initialData])

  return (
    <div className="ps-app" style={{ minHeight: "100vh", background: T.bg }}>
      <style>{FONT_STYLES}</style>
      
      {/* Header */}
      <div style={{ padding: "24px 32px", borderBottom: `1px solid ${T.rule}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h1 className="ps-display" style={{ fontSize: 28, fontWeight: 700, color: T.ink, margin: 0, marginBottom: 4 }}>
              Master Tracker
            </h1>
            <p style={{ color: T.inkSoft, margin: 0, fontSize: 14 }}>
              Complete patient lifecycle tracking from intake to billing
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                background: T.bgPaper,
                border: `1px solid ${T.rule}`,
                borderRadius: "6px",
                color: T.ink,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                background: T.t4,
                border: "none",
                borderRadius: "6px",
                color: "white",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <div style={{ background: T.bgPaper, padding: "16px", borderRadius: "8px", border: `1px solid ${T.rule}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <User size={16} color={T.inkSoft} />
              <Label size={8}>Total Patients</Label>
            </div>
            <div className="ps-display" style={{ fontSize: 24, fontWeight: 600, color: T.ink }}>
              {stats.total}
            </div>
          </div>
          
          <div style={{ background: T.bgPaper, padding: "16px", borderRadius: "8px", border: `1px solid ${T.rule}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <TrendingUp size={16} color={T.t1} />
              <Label size={8}>Revenue at Risk</Label>
            </div>
            <div className="ps-display" style={{ fontSize: 24, fontWeight: 600, color: T.t1 }}>
              {stats.atRisk}
            </div>
          </div>

          <div style={{ background: T.bgPaper, padding: "16px", borderRadius: "8px", border: `1px solid ${T.rule}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <AlertTriangle size={16} color={T.t1} />
              <Label size={8}>High Risk</Label>
            </div>
            <div className="ps-display" style={{ fontSize: 24, fontWeight: 600, color: T.t1 }}>
              {stats.highRisk}
            </div>
          </div>

          <div style={{ background: T.bgPaper, padding: "16px", borderRadius: "8px", border: `1px solid ${T.rule}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <DollarSign size={16} color={T.t4} />
              <Label size={8}>Ready to Bill</Label>
            </div>
            <div className="ps-display" style={{ fontSize: 24, fontWeight: 600, color: T.t4 }}>
              {stats.byStatus.billing_ready || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: "16px 32px", borderBottom: `1px solid ${T.rule}`, display: "flex", gap: "16px", alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: T.inkFaint }} />
          <input
            type="text"
            placeholder="Search patients, procedures, payers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px 8px 36px",
              border: `1px solid ${T.rule}`,
              borderRadius: "6px",
              fontSize: 14,
              background: T.bgPaper,
            }}
          />
        </div>
        
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          style={{
            padding: "8px 12px",
            border: `1px solid ${T.rule}`,
            borderRadius: "6px",
            fontSize: 14,
            background: T.bgPaper,
          }}
        >
          <option value="all">All Status</option>
          <option value="intake">Intake</option>
          <option value="review">Review</option>
          <option value="generate">Generate</option>
          <option value="signed">Signed</option>
          <option value="billed">Billed</option>
        </select>

        <select
          value={selectedRisk}
          onChange={(e) => setSelectedRisk(e.target.value)}
          style={{
            padding: "8px 12px",
            border: `1px solid ${T.rule}`,
            borderRadius: "6px",
            fontSize: 14,
            background: T.bgPaper,
          }}
        >
          <option value="all">All Risk Levels</option>
          <option value="low">Low Risk</option>
          <option value="moderate">Moderate Risk</option>
          <option value="high">High Risk</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ padding: "0 32px 32px" }}>
        <div style={{ background: T.bgPaper, borderRadius: "8px", border: `1px solid ${T.rule}`, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: T.bgAlt }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Patient
                </th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  DOB
                </th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Procedure
                </th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Status
                </th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Risk Score
                </th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Payer
                </th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Alerts
                </th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, index) => (
                <tr
                  key={item.id}
                  style={{
                    borderTop: `1px solid ${T.rule}`,
                    background: index % 2 === 0 ? T.bgPaper : T.bg,
                  }}
                >
                  <td style={{ padding: "16px" }}>
                    <div>
                      <div style={{ fontWeight: 500, color: T.ink, marginBottom: "2px" }}>
                        {item.patientName}
                      </div>
                      <div style={{ fontSize: 12, color: T.inkSoft }}>
                        ID: {item.id.slice(-8)}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "16px", fontSize: 14, color: T.ink }}>
                    {item.dob || "—"}
                  </td>
                  <td style={{ padding: "16px" }}>
                    <div>
                      <div style={{ fontWeight: 500, color: T.ink, marginBottom: "2px" }}>
                        {item.procedure || "—"}
                      </div>
                      {item.laterality && item.laterality !== "unknown" && (
                        <div style={{ fontSize: 12, color: T.inkSoft }}>
                          {item.laterality}
                        </div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "16px" }}>
                    <StatusBadge status={item.status} />
                  </td>
                  <td style={{ padding: "16px" }}>
                    <RiskBadge risk={item.riskLevel} />
                    {item.tridentRiskScore && (
                      <div style={{ fontSize: 12, color: T.inkSoft, marginTop: "4px" }}>
                        Score: {item.tridentRiskScore}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "16px", fontSize: 14, color: T.ink }}>
                    {item.payer || "—"}
                  </td>
                  <td style={{ padding: "16px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {item.revenueAtRisk && <RevenueAtRiskBadge atRisk={true} />}
                      {item.denialProbability > 0.7 && (
                        <Tag color={T.t1} soft={`${T.t1}20`}>
                          High denial risk
                        </Tag>
                      )}
                      {item.ocrConfidence < 0.85 && (
                        <Tag color={T.t2} soft={`${T.t2}20`}>
                          Low OCR confidence
                        </Tag>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "16px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        style={{
                          padding: "6px",
                          background: "transparent",
                          border: `1px solid ${T.rule}`,
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                        title="View Details"
                      >
                        <Eye size={14} color={T.inkSoft} />
                      </button>
                      <button
                        style={{
                          padding: "6px",
                          background: "transparent",
                          border: `1px solid ${T.rule}`,
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                        title="Generate Documents"
                      >
                        <FileText size={14} color={T.inkSoft} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredData.length === 0 && (
            <div style={{ padding: "48px", textAlign: "center", color: T.inkSoft }}>
              <FileSearch size={48} style={{ marginBottom: "16px", opacity: 0.5 }} />
              <div>No patients found matching your criteria</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
