/* SPEAR Standardized Types and Constants */

export const SPEAR_CASE_STATUSES = [
  "New Intake",
  "Document Review", 
  "Missing Documentation",
  "Poseidon Stored",
  "Trident Review",
  "Compliance Gap",
  "Ready for Fulfillment",
  "Fulfillment Pending",
  "POD Needed",
  "Revenue Support Prep",
  "Tebra Ready",
  "Exported",
  "Complete",
  "Archived",
  "Escalated",
] as const

export type SpearCaseStatus = typeof SPEAR_CASE_STATUSES[number]

export const SPEAR_RISK_FLAGS = [
  "Missing Signature",
  "Missing Prescription", 
  "Missing POD",
  "Date Sequence Issue",
  "Payer Support Gap",
  "Authorization Gap",
  "Duplicate Case",
  "Aged Case",
  "Incomplete Packet",
  "Manual Review Needed",
] as const

export type SpearRiskFlag = typeof SPEAR_RISK_FLAGS[number]

export const SPEAR_WORKFLOW_STAGES = [
  { key: "intake", label: "Intake", layer: "Spear" },
  { key: "poseidon", label: "Poseidon Stored", layer: "Poseidon" },
  { key: "trident", label: "Trident Review", layer: "Trident" },
  { key: "execution", label: "Spear Execution", layer: "Spear" },
  { key: "revenue", label: "Revenue Support", layer: "Spear" },
  { key: "ledger", label: "Ledger", layer: "Poseidon" },
] as const

export type SpearWorkflowStage = typeof SPEAR_WORKFLOW_STAGES[number]

export const SPEAR_OPERATING_CARDS = [
  { key: "open_cases", label: "Open Cases", layer: "Spear" },
  { key: "missing_docs", label: "Missing Docs", layer: "Trident" },
  { key: "trident_review", label: "Trident Review", layer: "Trident" },
  { key: "ready_fulfillment", label: "Ready for Fulfillment", layer: "Spear" },
  { key: "pod_needed", label: "POD Needed", layer: "Spear" },
  { key: "revenue_support", label: "Revenue Support", layer: "Spear" },
  { key: "tebra_ready", label: "Tebra Ready", layer: "Spear" },
  { key: "high_risk", label: "High-Risk Flags", layer: "Trident" },
] as const

export type SpearOperatingCard = typeof SPEAR_OPERATING_CARDS[number]

/* SPEAR Visual System */
export const SPEAR_COLORS = {
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
} as const

export type SpearColor = keyof typeof SPEAR_COLORS

/* Compliance Language */
export const SPEAR_COMPLIANCE_NOTICE = "Trident provides operational documentation intelligence only. Clinical decisions, medical necessity, and patient care determinations remain with licensed providers."

/* Platform Language */
export const SPEAR_PLATFORM_DOCTRINE = {
  tagline: "Compliance-Driven Healthcare Execution",
  supporting: "Secure internal execution layer for healthcare documentation, workflow, fulfillment, and revenue-support operations.",
  doctrine: "Clinicians decide.\nSpear organizes.\nOperators execute.\nThe record is preserved.",
} as const

/* Approved Language */
export const SPEAR_APPROVED_LANGUAGE = [
  "compliance-driven execution",
  "audit-ready documentation", 
  "documentation integrity",
  "operational lineage",
  "source-of-truth record",
  "case readiness",
  "missing-document detection",
  "workflow visibility",
  "billing-support packet",
  "revenue-support workflow",
  "provider-directed care",
  "operator-controlled execution",
  "secure internal access",
  "encrypted session",
  "authorized personnel only",
] as const

/* Layer Descriptions */
export const SPEAR_LAYER_DESCRIPTIONS = {
  spear: {
    name: "Spear",
    tagline: "Moves the workflow.",
    function: "Execution vehicle, product name, dashboard identity, interface wrapper, and operating layer.",
  },
  poseidon: {
    name: "Poseidon", 
    tagline: "Preserve the record.",
    function: "Warehousing and data aggregation engine. Stores, organizes, normalizes, preserves, and structures operational healthcare records.",
  },
  trident: {
    name: "Trident",
    tagline: "Find the gaps.", 
    function: "Three-pronged intelligence-agent AI layer. Reviews, flags, scores, routes, and recommends operational next actions.",
  },
} as const

/* Core Copy */
export const SPEAR_CORE_COPY = {
  command: "Control the workflow.",
  poseidon: "Preserve the record.",
  trident: "Find the gaps.",
  intake: "Capture the case.",
  fulfillment: "Move the product.",
  revenue_support: "Prepare the packet.",
  ledger: "Track the record.",
  integrations: "Connect the systems.",
} as const
