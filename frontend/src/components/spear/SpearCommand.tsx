"use client"

import React, { useMemo, useState } from "react"
import { Activity, AlertCircle, AlertTriangle, ArrowUpRight, CheckCircle2, ChevronRight, Download, Eye, FileCheck2, FileText, Lock, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, X, TrendingUp, TrendingDown, DollarSign, Calendar, User, FileSearch, Database, Brain, Zap, Archive, Settings, LogOut } from "lucide-react"

/* SPEAR Visual System */
const T = {
  bg: "#05070B",
  bgSoft: "#080D14", 
  panel: "#0B1220",
  panelSoft: "#111827",
  panelLift: "#151E2E",
  border: "#243044",
  borderSoft: "#1A2433",
  ivory: "#F7F2E8",
  white: "#FFFFFF",
  muted: "#A7B0C0",
  mutedSoft: "#6B7280",
  gold: "#B89B5E",
  goldSoft: "#D7C28A",
  blue: "#132238",
  blueBright: "#1E3A5F",
  danger: "#B91C1C",
  warning: "#C08403",
  success: "#15803D",
}

const FONT_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,200;0,300;0,400;0,500;1,300&family=JetBrains+Mono:wght@300;400;500&display=swap');
.spear-app, .spear-app * { box-sizing: border-box; }
.spear-app { font-family: 'DM Sans', sans-serif; font-size: 13px; line-height: 1.5; color: ${T.ivory}; -webkit-font-smoothing: antialiased; background: ${T.bg}; }
.spear-display { font-family: 'Syne', sans-serif; letter-spacing: -0.01em; }
.spear-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
.spear-mono-num { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.spear-app input::placeholder { color: ${T.mutedSoft}; }
.spear-app button:focus-visible, .spear-app input:focus-visible { outline: 1px solid ${T.gold}; outline-offset: 2px; }
.spear-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.spear-scroll::-webkit-scrollbar-track { background: transparent; }
.spear-scroll::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
.spear-scroll::-webkit-scrollbar-thumb:hover { background: ${T.mutedSoft}; }
.spear-link { transition: color 160ms ease, border-color 160ms ease, background 160ms ease, transform 160ms ease; }
.spear-card { transition: transform 200ms ease, border-color 200ms ease, background 200ms ease; }
.spear-card:hover { transform: translateY(-1px); }
`

/* Workflow Stages */
const WORKFLOW_STAGES = [
  { key: "intake", label: "Intake", icon: FileText, layer: "Spear" },
  { key: "poseidon", label: "Poseidon Stored", icon: Database, layer: "Poseidon" },
  { key: "trident", label: "Trident Review", icon: Brain, layer: "Trident" },
  { key: "execution", label: "Spear Execution", icon: Zap, layer: "Spear" },
  { key: "revenue", label: "Revenue Support", icon: DollarSign, layer: "Spear" },
  { key: "ledger", label: "Ledger", icon: Archive, layer: "Poseidon" },
]

/* Operating Cards */
const OPERATING_CARDS = [
  { key: "open_cases", label: "Open Cases", value: 0, delta: "+2", icon: FileText, color: T.gold },
  { key: "missing_docs", label: "Missing Docs", value: 0, delta: "-1", icon: AlertTriangle, color: T.warning },
  { key: "trident_review", label: "Trident Review", value: 0, delta: "+3", icon: Brain, color: T.blueBright },
  { key: "ready_fulfillment", label: "Ready for Fulfillment", value: 0, delta: "+1", icon: CheckCircle2, color: T.success },
  { key: "pod_needed", label: "POD Needed", value: 0, delta: "0", icon: FileCheck2, color: T.goldSoft },
  { key: "revenue_support", label: "Revenue Support", value: 0, delta: "+4", icon: DollarSign, color: T.success },
  { key: "tebra_ready", label: "Tebra Ready", value: 0, delta: "+2", icon: TrendingUp, color: T.gold },
  { key: "high_risk", label: "High-Risk Flags", value: 0, delta: "-1", icon: AlertCircle, color: T.danger },
]

const StatusBadge = ({ status, color = T.gold }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "2px 8px",
      background: `${color}20`,
      color,
      fontSize: "10px",
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      fontWeight: 500,
      border: `1px solid ${color}40`,
      borderRadius: "3px",
    }}
  >
    {status}
  </span>
)

const MetricCard = ({ card, data }) => {
  const Icon = card.icon
  const value = data[card.key] || 0
  
  return (
    <div
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: "8px",
        padding: "16px",
        position: "relative",
        overflow: "hidden",
      }}
      className="spear-card"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <Icon size={18} color={card.color} />
        <span style={{ fontSize: "11px", color: T.muted, fontWeight: 500 }}>
          {card.delta}
        </span>
      </div>
      <div style={{ fontSize: "24px", fontWeight: 600, color: T.ivory, marginBottom: "4px" }}>
        {value}
      </div>
      <div style={{ fontSize: "12px", color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {card.label}
      </div>
    </div>
  )
}

const WorkflowStage = ({ stage, isActive, hasItems }) => {
  const Icon = stage.icon
  
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        flex: 1,
        position: "relative",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: isActive ? `${stage.layer === "Poseidon" ? T.blue : stage.layer === "Trident" ? T.blueBright : T.gold}20` : T.panelSoft,
          border: `2px solid ${isActive ? (stage.layer === "Poseidon" ? T.blue : stage.layer === "Trident" ? T.blueBright : T.gold) : T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <Icon size={20} color={isActive ? (stage.layer === "Poseidon" ? T.blue : stage.layer === "Trident" ? T.blueBright : T.gold) : T.muted} />
        {hasItems > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              background: T.danger,
              color: T.white,
              fontSize: "10px",
              fontWeight: 600,
              padding: "2px 5px",
              borderRadius: "10px",
              minWidth: "16px",
              textAlign: "center",
            }}
          >
            {hasItems}
          </span>
        )}
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "11px", fontWeight: 500, color: T.ivory, marginBottom: "2px" }}>
          {stage.label}
        </div>
        <div style={{ fontSize: "9px", color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {stage.layer}
        </div>
      </div>
    </div>
  )
}

const ComplianceNotice = () => (
  <div
    style={{
      background: `${T.warning}10`,
      border: `1px solid ${T.warning}30`,
      borderRadius: "6px",
      padding: "12px",
      fontSize: "11px",
      color: T.goldSoft,
      lineHeight: 1.4,
    }}
  >
    <strong>Trident provides operational documentation intelligence only.</strong> Clinical decisions, medical necessity, and patient care determinations remain with licensed providers.
  </div>
)

export function SpearCommand({ initialData }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStage, setSelectedStage] = useState("all")

  // Mock data - replace with actual API calls
  const workflowData = useMemo(() => ({
    intake: { count: 12, active: true },
    poseidon: { count: 8, active: true },
    trident: { count: 5, active: true },
    execution: { count: 15, active: true },
    revenue: { count: 7, active: true },
    ledger: { count: 23, active: true },
  }), [])

  const metricsData = useMemo(() => ({
    open_cases: 12,
    missing_docs: 3,
    trident_review: 5,
    ready_fulfillment: 8,
    pod_needed: 4,
    revenue_support: 7,
    tebra_ready: 6,
    high_risk: 2,
  }), [])

  return (
    <div className="spear-app" style={{ background: T.bg }}>
      <style>{FONT_STYLES}</style>
      
      {/* Page Header */}
      <div style={{ 
        padding: "24px 32px", 
        borderBottom: `1px solid ${T.border}`,
        background: `linear-gradient(180deg, ${T.bg} 0%, ${T.bgSoft} 100%)`
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h1 className="spear-display" style={{ fontSize: 24, fontWeight: 600, color: T.ivory, margin: 0, marginBottom: 4 }}>
              Command
            </h1>
            <p style={{ color: T.muted, margin: 0, fontSize: 12, letterSpacing: "0.5px" }}>
              Control the workflow
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                background: T.panel,
                border: `1px solid ${T.border}`,
                borderRadius: "6px",
                color: T.ivory,
                fontSize: 13,
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
                background: T.gold,
                border: "none",
                borderRadius: "6px",
                color: T.bg,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Plus size={16} />
              New Intake
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ position: "relative", maxWidth: "400px" }}>
          <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: T.mutedSoft }} />
          <input
            type="text"
            placeholder="Search cases, patients, providers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px 10px 36px",
              background: T.panel,
              border: `1px solid ${T.border}`,
              borderRadius: "6px",
              fontSize: 13,
              color: T.ivory,
            }}
          />
        </div>
      </div>

      {/* Workflow Line */}
      <div style={{ 
        padding: "24px 32px", 
        borderBottom: `1px solid ${T.border}`,
        background: T.bgSoft
      }}>
        <div style={{ marginBottom: "16px" }}>
          <h2 className="spear-display" style={{ fontSize: 16, fontWeight: 600, color: T.ivory, margin: 0, marginBottom: 4 }}>
            Command Workflow
          </h2>
          <p style={{ color: T.muted, margin: 0, fontSize: 12 }}>
            Inbound case → Poseidon record → Trident review → Spear execution → Revenue support → Ledger preservation
          </p>
        </div>
        
        <div style={{ display: "flex", gap: "16px", alignItems: "center", position: "relative" }}>
          {WORKFLOW_STAGES.map((stage, index) => (
            <React.Fragment key={stage.key}>
              <WorkflowStage 
                stage={stage} 
                isActive={workflowData[stage.key]?.active}
                hasItems={workflowData[stage.key]?.count}
              />
              {index < WORKFLOW_STAGES.length - 1 && (
                <div style={{
                  flex: 1,
                  height: "2px",
                  background: `linear-gradient(90deg, ${T.gold}40, ${T.gold}20)`,
                  position: "relative",
                }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Operating Cards */}
      <div style={{ padding: "24px 32px" }}>
        <div style={{ marginBottom: "20px" }}>
          <h2 className="spear-display" style={{ fontSize: 16, fontWeight: 600, color: T.ivory, margin: 0, marginBottom: 4 }}>
            Command Status
          </h2>
          <p style={{ color: T.muted, margin: 0, fontSize: 12 }}>
            Real-time operational metrics across all layers
          </p>
        </div>
        
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", 
          gap: "16px",
          marginBottom: "32px"
        }}>
          {OPERATING_CARDS.map((card) => (
            <MetricCard key={card.key} card={card} data={metricsData} />
          ))}
        </div>

        {/* Layer Status Sections */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {/* Poseidon Status */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <Database size={20} color={T.blue} />
              <div>
                <h3 className="spear-display" style={{ fontSize: 14, fontWeight: 600, color: T.ivory, margin: 0 }}>
                  Poseidon Vault
                </h3>
                <p style={{ color: T.muted, margin: 0, fontSize: 11 }}>
                  Source-of-truth case record
                </p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.muted }}>Total Records</span>
                <span style={{ fontSize: 13, color: T.ivory, fontWeight: 500 }}>1,247</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.muted }}>Storage Used</span>
                <span style={{ fontSize: 13, color: T.ivory, fontWeight: 500 }}>18.4 GB</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.muted }}>Last Sync</span>
                <span style={{ fontSize: 13, color: T.success, fontWeight: 500 }}>2 min ago</span>
              </div>
            </div>
          </div>

          {/* Trident Status */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <Brain size={20} color={T.blueBright} />
              <div>
                <h3 className="spear-display" style={{ fontSize: 14, fontWeight: 600, color: T.ivory, margin: 0 }}>
                  Trident Intelligence
                </h3>
                <p style={{ color: T.muted, margin: 0, fontSize: 11 }}>
                  Review, flags, and routing
                </p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.muted }}>Cases Reviewed</span>
                <span style={{ fontSize: 13, color: T.ivory, fontWeight: 500 }}>892</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.muted }}>Risk Flags</span>
                <span style={{ fontSize: 13, color: T.warning, fontWeight: 500 }}>47</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.muted }}>Next Actions</span>
                <span style={{ fontSize: 13, color: T.gold, fontWeight: 500 }}>124</span>
              </div>
            </div>
            <div style={{ marginTop: "12px" }}>
              <ComplianceNotice />
            </div>
          </div>

          {/* Spear Execution Status */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <Zap size={20} color={T.gold} />
              <div>
                <h3 className="spear-display" style={{ fontSize: 14, fontWeight: 600, color: T.ivory, margin: 0 }}>
                  Spear Execution
                </h3>
                <p style={{ color: T.muted, margin: 0, fontSize: 11 }}>
                  Workflow movement and fulfillment
                </p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.muted }}>Active Tasks</span>
                <span style={{ fontSize: 13, color: T.ivory, fontWeight: 500 }}>156</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.muted }}>Fulfillment Pending</span>
                <span style={{ fontSize: 13, color: T.gold, fontWeight: 500 }}>23</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.muted }}>Completed Today</span>
                <span style={{ fontSize: 13, color: T.success, fontWeight: 500 }}>41</span>
              </div>
            </div>
          </div>

          {/* Revenue Support Status */}
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <DollarSign size={20} color={T.success} />
              <div>
                <h3 className="spear-display" style={{ fontSize: 14, fontWeight: 600, color: T.ivory, margin: 0 }}>
                  Revenue Support
                </h3>
                <p style={{ color: T.muted, margin: 0, fontSize: 11 }}>
                  Billing packet preparation
                </p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.muted }}>Tebra Ready</span>
                <span style={{ fontSize: 13, color: T.ivory, fontWeight: 500 }}>67</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.muted }}>Packet Prep</span>
                <span style={{ fontSize: 13, color: T.gold, fontWeight: 500 }}>19</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: T.muted }}>Revenue at Risk</span>
                <span style={{ fontSize: 13, color: T.danger, fontWeight: 500 }}>8</span>
              </div>
            </div>
            <div style={{ marginTop: "12px" }}>
              <ComplianceNotice />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
