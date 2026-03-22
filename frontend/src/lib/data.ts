export interface KanbanCard {
  id: string
  patientId?: string
  businessLine?: "dme" | "implants" | "biologics" | "matia"
  title: string
  value: string
  priority: "high" | "med" | "low"
  assignee: string
  payer: string
  type: string
  due: string
  orderCount?: number
  href?: string
  orderIds?: string[]
  locked?: boolean
  lockReason?: string
}

export interface KanbanColumn {
  id: string
  label: string
  color: string
  cards: KanbanCard[]
}

export interface AccountRecord {
  id: string
  businessLine?: "dme" | "implants" | "biologics" | "matia"
  name: string
  payer: string
  status: "active" | "pending" | "appeal" | "denied"
  value: string
  type: string
  orderCount?: number
  href?: string
}

export const KPI_DATA = {
  cleanClaimRate: { value: 97.2, delta: "+0.8 pts", trend: "up" },
  daysInAR: { value: 18.4, delta: "-4.2 days", trend: "up" },
  appealWinRate: { value: 88.0, delta: "+3.4%", trend: "up" },
  outstandingOrders: { value: 47, urgent: 7, trend: "neutral" },
} as const

export const PIPELINE_DATA = {
  pendingAuth: { count: 27, value: "$184,200" },
  authorized: { count: 89, value: "$612,800" },
  submitted: { count: 8, value: "$54,100" },
  denied: { count: 5, value: "$38,400" },
  appealed: { count: 14, value: "$142,300" },
  paid: { count: 174, value: "$1,190,000" },
} as const

export const SYSTEM_STATE = {
  status: "operational",
  services: ["Core", "Trident", "Intake", "ML"],
  ports: "8001–8004",
  operators: ["Admin", "Billing", "Rep"],
  lastSync: new Date().toISOString(),
} as const

export const ACCOUNTS: AccountRecord[] = [
  { id: "ACC-001", businessLine: "dme", name: "Rosa Alvarez", payer: "Aetna", status: "active", value: "$12,400", type: "DME" },
  { id: "ACC-002", businessLine: "implants", name: "Marcus T.", payer: "BCBS", status: "pending", value: "$28,100", type: "Surgical" },
  { id: "ACC-003", businessLine: "biologics", name: "Linda R.", payer: "UHC", status: "appeal", value: "$9,200", type: "Biologics" },
  { id: "ACC-004", businessLine: "matia", name: "James K.", payer: "Medicare", status: "active", value: "$4,800", type: "Mobility" },
  { id: "ACC-005", businessLine: "implants", name: "Sarah M.", payer: "Cigna", status: "denied", value: "$31,600", type: "Surgical" },
  { id: "ACC-006", businessLine: "dme", name: "Robert A.", payer: "Aetna", status: "active", value: "$7,300", type: "DME" },
  { id: "ACC-007", businessLine: "dme", name: "Emma P.", payer: "Medicaid", status: "active", value: "$2,900", type: "DME" },
  { id: "ACC-008", businessLine: "biologics", name: "David L.", payer: "BCBS", status: "appeal", value: "$18,500", type: "Biologics" },
]

export const KANBAN_DATA: Record<string, KanbanColumn> = {
  pendingAuth: {
    id: "pendingAuth",
    label: "Pending Auth",
    color: "#c9921a",
    cards: [
      { id: "K-001", businessLine: "matia", title: "Power Wheelchair L8000 — Medicare", value: "$4,800", priority: "high", assignee: "RC", payer: "Medicare", type: "Mobility", due: "2026-03-20" },
      { id: "K-002", businessLine: "biologics", title: "ACL Reconstruction Biologics Bundle", value: "$19,200", priority: "high", assignee: "KL", payer: "Aetna", type: "Biologics", due: "2026-03-22" },
      { id: "K-003", businessLine: "dme", title: "TENS Unit — BCBS prior auth", value: "$1,200", priority: "low", assignee: "MM", payer: "BCBS", type: "DME", due: "2026-03-25" },
    ],
  },
  authorized: {
    id: "authorized",
    label: "Authorized",
    color: "#1a6ef5",
    cards: [
      { id: "K-004", businessLine: "implants", title: "Spinal Cord Stimulator — UHC", value: "$34,500", priority: "high", assignee: "RC", payer: "UHC", type: "Implants", due: "2026-03-18" },
      { id: "K-005", businessLine: "dme", title: "Knee Brace x2 — Cigna verified", value: "$2,900", priority: "med", assignee: "JA", payer: "Cigna", type: "DME", due: "2026-03-19" },
      { id: "K-006", businessLine: "dme", title: "Hospital Bed + Rails — Medicaid", value: "$3,400", priority: "med", assignee: "RC", payer: "Medicaid", type: "DME", due: "2026-03-21" },
    ],
  },
  submitted: {
    id: "submitted",
    label: "Submitted",
    color: "#0d9eaa",
    cards: [
      { id: "K-007", businessLine: "implants", title: "Hip Replacement Implant — Medicare", value: "$28,100", priority: "high", assignee: "KL", payer: "Medicare", type: "Implants", due: "2026-03-17" },
      { id: "K-008", businessLine: "dme", title: "CPAP w/ Humidifier — ResMed", value: "$2,200", priority: "med", assignee: "MM", payer: "Aetna", type: "DME", due: "2026-03-18" },
    ],
  },
  denied: {
    id: "denied",
    label: "Denied",
    color: "#e03a3a",
    cards: [
      { id: "K-009", businessLine: "dme", title: "CPAP denial — UHC medical necessity", value: "$2,200", priority: "high", assignee: "JA", payer: "UHC", type: "DME", due: "2026-03-16" },
      { id: "K-010", businessLine: "biologics", title: "Biologics denial — wrong DX code", value: "$11,600", priority: "high", assignee: "RC", payer: "BCBS", type: "Biologics", due: "2026-03-18" },
    ],
  },
  appealed: {
    id: "appealed",
    label: "Appealed",
    color: "#7c5af0",
    cards: [
      { id: "K-011", businessLine: "implants", title: "L1 Appeal — Spinal Stim UHC", value: "$34,500", priority: "high", assignee: "RC", payer: "UHC", type: "Implants", due: "2026-03-20" },
      { id: "K-012", businessLine: "biologics", title: "Trident appeal — Biologics BCBS", value: "$11,600", priority: "high", assignee: "KL", payer: "BCBS", type: "Biologics", due: "2026-03-22" },
    ],
  },
}
