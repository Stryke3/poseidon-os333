import { redirect } from "next/navigation"

import { getSafeServerSession } from "@/lib/auth"
import { getHcpcsShortDescription } from "@/lib/hcpcs"
import type { AccountRecord, KanbanCard, KanbanColumn } from "@/lib/data"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_FETCH_TIMEOUT_MS = Number.parseInt(process.env.CORE_FETCH_TIMEOUT_MS || "8000", 10)

/** When unset, Matia pipeline is not fetched. */
function matiaPipelineBaseUrl(): string | null {
  const explicit = process.env.MATIA_API_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, "")
  if (process.env.MATIA_INTEGRATION_ENABLED === "true") return "https://matia.strykefox.com"
  return null
}

const MATIA_PIPELINE_PATH = process.env.MATIA_PIPELINE_PATH || "/pipeline"

/**
 * Wheelchair / mobility HCPCS reimbursement rate card.
 * Rates reflect Medicare fee schedule averages; payer-specific overrides
 * can be layered in via the Matia pipeline's `expected_amount` field.
 */
const WHEELCHAIR_PRICING: Record<string, { rate: number; label: string }> = {
  // Power wheelchairs
  K0823: { rate: 35999, label: "Power Wheelchair Group 2 Standard" },
  K0824: { rate: 38500, label: "Power Wheelchair Group 2 Heavy Duty" },
  K0856: { rate: 42750, label: "Power Wheelchair Group 3 Standard" },
  K0857: { rate: 46200, label: "Power Wheelchair Group 3 Heavy Duty" },
  K0858: { rate: 51300, label: "Power Wheelchair Group 3 Very Heavy Duty" },
  K0861: { rate: 55000, label: "Power Wheelchair Group 2 Single Power" },
  K0862: { rate: 58500, label: "Power Wheelchair Group 2 Multiple Power" },
  K0868: { rate: 48900, label: "Power Wheelchair Group 4 Standard" },
  K0869: { rate: 52300, label: "Power Wheelchair Group 4 Heavy Duty" },
  K0333: { rate: 36800, label: "Power Wheelchair Group 2 Pediatric" },
  // Tek RMD / Standing / Specialty
  K0890: { rate: 67500, label: "Tek RMD Power Standing Wheelchair" },
  K0891: { rate: 72000, label: "Tek RMD Power Standing Heavy Duty" },
  E2300: { rate: 62000, label: "Power Standing System" },
  // Manual wheelchairs
  K0001: { rate: 1250, label: "Standard Manual Wheelchair" },
  K0002: { rate: 1650, label: "Standard Hemi Wheelchair" },
  K0003: { rate: 2100, label: "Lightweight Wheelchair" },
  K0004: { rate: 3200, label: "High-Strength Lightweight Wheelchair" },
  K0005: { rate: 4800, label: "Ultralight Wheelchair" },
  K0006: { rate: 5200, label: "Heavy Duty Wheelchair" },
  K0007: { rate: 6100, label: "Extra Heavy Duty Wheelchair" },
  // Accessories & components
  E0950: { rate: 450, label: "Wheelchair Tray" },
  E0955: { rate: 650, label: "Wheelchair Headrest" },
  E0956: { rate: 380, label: "Wheelchair Lateral Trunk Support" },
  E0957: { rate: 420, label: "Wheelchair Medial Knee Support" },
  E0960: { rate: 290, label: "Wheelchair Positioning Belt" },
  E0973: { rate: 1200, label: "Wheelchair Cushion Width >= 22 in" },
  E0981: { rate: 550, label: "Wheelchair Seat Upholstery Replacement" },
  E1002: { rate: 750, label: "Wheelchair Cushion Power" },
  E1014: { rate: 2800, label: "Wheelchair Recline Back" },
  E1015: { rate: 3200, label: "Wheelchair Shock Absorber" },
  E1020: { rate: 1100, label: "Wheelchair Residual Limb Support" },
  E2310: { rate: 1800, label: "Power Wheelchair Electronic Controller" },
  E2311: { rate: 2400, label: "Power Wheelchair Controller Proportional" },
  E2325: { rate: 950, label: "Power Wheelchair Sip and Puff Interface" },
  E2340: { rate: 3600, label: "Power Wheelchair Seat Elevator" },
  E2351: { rate: 4200, label: "Power Wheelchair Seat Tilt" },
  E2366: { rate: 1650, label: "Power Wheelchair Battery" },
  E2368: { rate: 850, label: "Power Wheelchair Battery Charger" },
  // Matia-specific custom chair (Permobil Corpus / Tek RMD line)
  L8000: { rate: 35999, label: "Tek RMD Matia Power Wheelchair" },
}

/** Default reimbursement when HCPCS code is missing or unrecognized. */
const MATIA_DEFAULT_REIMBURSEMENT_USD = 35999

function getWheelchairReimbursement(hcpcs: string | null | undefined): number {
  if (!hcpcs) return MATIA_DEFAULT_REIMBURSEMENT_USD
  const code = hcpcs.trim().toUpperCase()
  return WHEELCHAIR_PRICING[code]?.rate ?? MATIA_DEFAULT_REIMBURSEMENT_USD
}

/** Pull list payload from common REST / GraphQL-style envelopes. */
function extractMatiaPipelineRecords(payload: unknown): unknown[] {
  if (payload == null) return []
  if (Array.isArray(payload)) return payload
  if (typeof payload !== "object") return []
  const o = payload as Record<string, unknown>

  if (Array.isArray(o.data)) return o.data

  const keys = [
    "pipeline",
    "items",
    "records",
    "results",
    "rows",
    "cases",
    "orders",
    "entries",
  ] as const
  for (const key of keys) {
    const v = o[key]
    if (Array.isArray(v)) return v
  }

  const nested = o.data
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>
    if (Array.isArray(inner.data)) return inner.data
    for (const key of keys) {
      const v = inner[key]
      if (Array.isArray(v)) return v
    }
  }

  return []
}

function readStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === "string") return v
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return null
}

/** Map one Matia row (snake_case or camelCase) into a Core-shaped order. */
function matiaRowToOrderRecord(raw: unknown): OrderRecord | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const id = r.id ?? r.case_id ?? r.caseId ?? r.order_id ?? r.orderId
  if (id === null || id === undefined) return null
  const idStr = String(id)

  const patientName =
    readStr(r.patient_name) ||
    readStr(r.patientName) ||
    readStr(r.name) ||
    [readStr(r.first_name) || readStr(r.firstName), readStr(r.last_name) || readStr(r.lastName)]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    null

  const hcpcs =
    readStr(r.hcpcs) || readStr(r.hcpcs_code) || readStr(r.hcpcsCode) || readStr(r.code)
  const wheelchair =
    readStr(r.wheelchair_type) || readStr(r.wheelchairType) || readStr(r.chair_type)
  const model =
    readStr(r.model) || readStr(r.wheelchair_model) || readStr(r.chair_model) || readStr(r.product)
  const manufacturer =
    readStr(r.manufacturer) || readStr(r.brand) || readStr(r.mfr)
  const payer = readStr(r.payer) || readStr(r.payer_name) || readStr(r.payerName)
  const stage = readStr(r.stage) || readStr(r.status) || readStr(r.state)
  const priority = readStr(r.priority)
  const created =
    readStr(r.created_at) || readStr(r.createdAt) || readStr(r.updated_at) || readStr(r.updatedAt)

  // Use pipeline-supplied amount if available, otherwise look up HCPCS rate card
  const pipelineAmount = typeof r.expected_amount === "number" ? r.expected_amount
    : typeof r.amount === "number" ? r.amount
    : typeof r.price === "number" ? r.price
    : null

  const patientId = `matia-${idStr}`

  // Build descriptive order type from available metadata
  const isTekRmd = model?.toLowerCase().includes("tek") || model?.toLowerCase().includes("rmd")
    || manufacturer?.toLowerCase().includes("permobil")
    || hcpcs === "K0890" || hcpcs === "K0891"
  let orderType: string
  if (isTekRmd) {
    orderType = `Tek RMD ${wheelchair === "manual" ? "manual" : "power"} wheelchair`
  } else if (wheelchair === "power" || wheelchair === "manual") {
    orderType = `Matia ${wheelchair} wheelchair`
  } else if (model) {
    orderType = `Matia ${model}`
  } else {
    orderType = "Matia chair"
  }

  // Look up HCPCS-based pricing from rate card
  const reimbursement = pipelineAmount ?? getWheelchairReimbursement(hcpcs)

  return {
    id: `matia-${idStr}`,
    patient_id: patientId,
    patient_name: patientName || `Matia Patient ${idStr}`,
    payer_name: payer || "Unknown",
    hcpcs_code: hcpcs || undefined,
    order_type: orderType,
    status: stage || "intake",
    expected_amount: reimbursement,
    priority: priority || undefined,
    assigned_to: "MT",
    updated_at: created || undefined,
    created_at: created || undefined,
  }
}

async function fetchMatiaPipelineAsOrders(accessToken: string): Promise<OrderRecord[]> {
  const base = matiaPipelineBaseUrl()
  if (!base) return []

  const path = MATIA_PIPELINE_PATH.startsWith("/") ? MATIA_PIPELINE_PATH : `/${MATIA_PIPELINE_PATH}`
  const bearer = process.env.MATIA_API_BEARER?.trim()
  const authorization = bearer
    ? bearer.toLowerCase().startsWith("bearer ")
      ? bearer
      : `Bearer ${bearer}`
    : `Bearer ${accessToken}`

  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  }).catch(() => null)

  if (!res?.ok) {
    console.warn(`Matia pipeline unavailable${res ? ` (HTTP ${res.status})` : ""}`)
    return []
  }

  const data = await res.json().catch(() => null)
  const rows = extractMatiaPipelineRecords(data)
  return rows.map(matiaRowToOrderRecord).filter((o): o is OrderRecord => o !== null)
}

async function fetchCoreJson(
  path: string,
  headers: Record<string, string>,
) {
  const coreApiUrl = getServiceBaseUrl("POSEIDON_API_URL")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CORE_FETCH_TIMEOUT_MS)
  try {
    return await fetch(`${coreApiUrl}${path}`, {
      headers,
      cache: "no-store",
      signal: controller.signal,
    }).catch(() => null)
  } finally {
    clearTimeout(timeout)
  }
}

type OrderRecord = {
  id: string
  patient_id?: string
  patient_name?: string
  first_name?: string
  last_name?: string
  payer_name?: string
  payer?: string
  payer_id?: string
  hcpcs_code?: string
  hcpcs?: string
  hcpcs_codes?: string[]
  order_type?: string
  status?: string
  denied_amount?: number | string
  billed_amount?: number | string
  expected_amount?: number | string
  priority?: string
  assigned_to?: string
  assigned_to_user_id?: string
  eligibility_status?: string
  swo_status?: string
  billing_status?: string
  paid_amount?: number | string
  total_paid?: number | string
  total_billed?: number | string
  payment_date?: string
  paid_at?: string
  updated_at?: string
  created_at?: string
  source_channel?: string
  source_reference?: string
}

type DenialRecord = {
  order_id?: string
  denial_reason?: string
  status?: string
  amount?: number | string
}

type AppealRecord = {
  outcome?: string | null
  outcome_amount?: number | string | null
  response_received_at?: string | null
  status?: string | null
}

export type DashboardBuildOptions = {
  appeals?: AppealRecord[]
  integrations?: Record<string, unknown>
}

function normOrderStatus(s?: string) {
  return (s || "").toLowerCase().trim()
}

function parseTimestampMs(s?: string | null): number | null {
  if (!s) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

function daysBetweenMs(from: number, to: number) {
  return Math.max(0, Math.round((to - from) / 86_400_000))
}

function computeCleanClaimProxy(orders: OrderRecord[]) {
  const paid = orders.filter((o) => ["paid", "closed"].includes(normOrderStatus(o.status))).length
  const denied = orders.filter((o) => normOrderStatus(o.status) === "denied").length
  const denom = paid + denied
  if (denom === 0) {
    return { value: 0, delta: "No paid/denied outcomes yet", trend: "neutral" }
  }
  const pct = Math.round((1000 * paid) / denom) / 10
  return {
    value: pct,
    delta: `${paid} paid · ${denied} denied`,
    trend: paid >= denied ? ("up" as const) : ("down" as const),
  }
}

function computeDaysInAR(orders: OrderRecord[]) {
  const terminal = new Set(["paid", "closed"])
  const open = orders.filter((o) => !terminal.has(normOrderStatus(o.status)))
  let avgOpen = 0
  if (open.length) {
    const ages = open.map((o) => {
      const start = parseTimestampMs(o.updated_at || o.created_at)
      if (!start) return 0
      return daysBetweenMs(start, Date.now())
    })
    avgOpen = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
  }

  const paidOrders = orders.filter((o) => ["paid", "closed"].includes(normOrderStatus(o.status)))
  const payCycles = paidOrders
    .map((o) => {
      const start = parseTimestampMs(o.created_at)
      const end = parseTimestampMs(o.payment_date) ?? parseTimestampMs(o.paid_at)
      if (!start || !end) return null
      return daysBetweenMs(start, end)
    })
    .filter((d): d is number => d != null)
  const avgToPay =
    payCycles.length > 0 ? Math.round(payCycles.reduce((a, b) => a + b, 0) / payCycles.length) : null

  const deltaParts = [
    open.length ? `${open.length} open` : "No open orders",
    avgToPay != null ? `avg ${avgToPay}d to pay` : null,
  ].filter(Boolean)

  return {
    value: open.length ? avgOpen : avgToPay ?? 0,
    delta: deltaParts.join(" · "),
    trend: (open.length ? avgOpen : avgToPay ?? 0) > 45 ? "up" : (open.length ? avgOpen : avgToPay ?? 0) > 20 ? "neutral" : "down",
  }
}

function appealResolved(a: AppealRecord) {
  return Boolean(a.response_received_at) || normOrderStatus(a.status) === "closed"
}

function appealIsWin(a: AppealRecord) {
  const o = normOrderStatus(a.outcome)
  const raw = a.outcome_amount
  const amt = typeof raw === "number" && Number.isFinite(raw) ? raw : Number.parseFloat(String(raw ?? ""))
  const finiteAmt = Number.isFinite(amt) ? amt : 0
  if (finiteAmt > 0 && !o.includes("denied") && !o.includes("upheld")) return true
  return o.includes("won") || o.includes("overturn") || o.includes("favor") || o === "approved"
}

function appealIsLoss(a: AppealRecord) {
  const o = normOrderStatus(a.outcome)
  return o.includes("denied") || o.includes("upheld") || o.includes("reject")
}

function computeAppealWinRate(appeals: AppealRecord[]) {
  const resolved = appeals.filter(appealResolved)
  const judged = resolved.filter((a) => appealIsWin(a) || appealIsLoss(a))
  const wins = judged.filter((a) => appealIsWin(a)).length
  const losses = judged.filter((a) => appealIsLoss(a) && !appealIsWin(a)).length
  if (wins + losses === 0) {
    return {
      value: 0,
      delta: appeals.length ? `${appeals.length} appeals · no outcomes` : "No appeals",
      trend: "neutral",
    }
  }
  const pct = Math.round((1000 * wins) / (wins + losses)) / 10
  return {
    value: pct,
    delta: `${wins}W / ${losses}L`,
    trend: wins >= losses ? "up" : "down",
  }
}

function buildSystemState(orders: OrderRecord[], integrations?: Record<string, unknown>) {
  const email = integrations?.email as
    | { configured?: boolean; provider?: string | null; from_address?: string | null }
    | undefined
  const cal = integrations?.calendar as { configured?: boolean; provider?: string | null } | undefined
  const push = integrations?.in_app_push as { configured?: boolean; sources?: string[] } | undefined

  const services = ["Core API"]
  if (email?.configured) services.push(`Email (${email.provider || "SMTP"})`)
  if (cal?.configured) services.push(`Calendar (${cal.provider || "connected"})`)
  if (push?.configured && push.sources?.length) services.push(`Push (${push.sources.length} sources)`)
  services.push("Dashboard")

  const maxTouch = orders.reduce((max, o) => {
    const t = parseTimestampMs(o.updated_at || o.created_at)
    return t && t > max ? t : max
  }, 0)

  let hostLabel = "Core"
  try {
    hostLabel = new URL(getServiceBaseUrl("POSEIDON_API_URL")).host || "Core"
  } catch {
    /* ignore */
  }

  return {
    status: orders.length ? "operational" : "connected",
    services,
    ports: hostLabel,
    operators: email?.from_address ? [String(email.from_address)] : [],
    lastSync: maxTouch > 0 ? new Date(maxTouch).toISOString() : new Date().toISOString(),
  }
}

const UNKNOWN_INTEGRATIONS: Record<string, unknown> = {
  email: { configured: false, provider: null },
  calendar: { configured: false, provider: null },
  in_app_push: { configured: false, sources: [] },
}

const COLUMN_META: Record<string, { label: string; color: string }> = {
  intake: { label: "Intake", color: "#c9921a" },
  eligibility_verification: { label: "Eligibility", color: "#1a6ef5" },
  prior_auth: { label: "Auth / CMN", color: "#0d9eaa" },
  documentation: { label: "Documentation", color: "#7c5af0" },
  delivered: { label: "Delivered", color: "#2b8a78" },
  claim_submitted: { label: "Submitted", color: "#4a6a90" },
  pending_payment: { label: "Pmt Pending", color: "#0fa86a" },
  denied: { label: "Denied", color: "#e03a3a" },
  appealed: { label: "Appealed", color: "#7c5af0" },
  paid: { label: "Paid", color: "#0fa86a" },
}

const EMPTY_COLUMNS = Object.fromEntries(
  Object.entries(COLUMN_META).map(([id, meta]) => [
    id,
    { id, label: meta.label, color: meta.color, cards: [] as KanbanCard[] },
  ]),
) as Record<string, KanbanColumn>

const PATIENT_STAGE_PRIORITY: Record<string, number> = {
  denied: 6,
  appealed: 5,
  prior_auth: 4,
  delivered: 3,
  claim_submitted: 2,
  pending_payment: 1,
  paid: 0,
}

type PatientStageAggregate = {
  id: string
  patientId: string
  realPatientId: string | null
  businessLine: "dme" | "implants" | "biologics" | "matia"
  name: string
  payer: string
  stage: string
  amount: number | null
  orderCount: number
  priority: KanbanCard["priority"]
  assignee: string
  due: string
  topCode: string
  orderIds: string[]
  locked: boolean
  lockReason?: string
}

type PatientAccountAggregate = {
  id: string
  patientId: string
  realPatientId: string | null
  businessLine: "dme" | "implants" | "biologics" | "matia"
  name: string
  payer: string
  stage: string
  amount: number | null
  orderCount: number
  topCode: string
}

function getRealPatientId(order: OrderRecord) {
  const patientId = order.patient_id?.trim()
  if (!patientId || patientId.startsWith("matia-")) return null
  return patientId
}

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatAmountDisplay(amount: number | null) {
  return amount && amount > 0 ? toCurrency(amount) : "Pending"
}

function parseAmount(value?: number | string) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function getOrderAmount(order: OrderRecord, denialsByOrderId: Map<string, DenialRecord[]>) {
  if (isMatiaChairProductLine(order)) {
    return parseAmount(order.expected_amount) || getWheelchairReimbursement(order.hcpcs_code)
  }

  const status = (order.status || "").toLowerCase()
  const reimbursed =
    parseAmount(order.paid_amount) || parseAmount(order.total_paid)
  const denialFromRows = denialsByOrderId
    .get(order.id)
    ?.reduce((sum, denial) => sum + parseAmount(denial.amount), 0)
  const deniedOrder = parseAmount(order.denied_amount)
  const denialTotal = denialFromRows || deniedOrder

  if ((status === "paid" || status === "closed") && reimbursed > 0) {
    return reimbursed
  }
  if (denialTotal > 0) {
    return denialTotal
  }
  if (reimbursed > 0) {
    return reimbursed
  }

  const billedFallback =
    parseAmount(order.total_billed) ||
    parseAmount(order.billed_amount) ||
    parseAmount(order.expected_amount)

  return billedFallback > 0 ? billedFallback : null
}

function getColumnId(status?: string) {
  switch ((status || "").toLowerCase()) {
    case "draft":
    case "new":
    case "intake":
      return "intake"
    case "eligibility_check":
    case "eligibility_verification":
    case "eligibility":
      return "eligibility_verification"
    case "pending_auth":
    case "prior_auth":
    case "prior auth":
      return "prior_auth"
    case "documentation":
    case "documents_pending":
      return "documentation"
    case "delivered":
    case "delivery_complete":
    case "delivery_completed":
    case "pod_received":
    case "proof_of_delivery":
      return "delivered"
    case "authorized":
    case "approved":
    case "submitted":
    case "ready_to_submit":
    case "claim_submitted":
      return "claim_submitted"
    case "pending_pay":
    case "pending pay":
    case "pending_payment":
    case "processing":
    case "pending_review":
      return "pending_payment"
    case "denied":
    case "write_off":
      return "denied"
    case "appealed":
      return "appealed"
    case "paid":
    case "closed":
      return "paid"
    default:
      return "intake"
  }
}

function getPriority(order: OrderRecord, amount: number): KanbanCard["priority"] {
  const normalized = (order.priority || "").toLowerCase()
  if (normalized === "high" || normalized === "urgent") return "high"
  if (normalized === "low") return "low"
  if (amount >= 5000) return "high"
  if (amount >= 1500) return "med"
  return "low"
}

function getAssignee(order: OrderRecord) {
  const value = (order.assigned_to || "OS").trim()
  return value.slice(0, 2).toUpperCase() || "OS"
}

function getPatientName(order: OrderRecord) {
  return (
    order.patient_name ||
    [order.first_name, order.last_name].filter(Boolean).join(" ") ||
    "Unknown Patient"
  )
}

function getPatientKey(order: OrderRecord) {
  const patientName = getPatientName(order).toLowerCase()
  const payer = (order.payer_name || order.payer || order.payer_id || "unknown").toLowerCase()
  return order.patient_id || `${patientName}::${payer}`
}

function inferBusinessLine(order: OrderRecord) {
  const codeStr = [order.hcpcs_code, order.hcpcs, ...(order.hcpcs_codes || [])]
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
  // Wheelchair HCPCS → Matia-only chair catalog for this org
  if (/\b(K0001|K0005|K0333|K0823|K0856)\b/.test(codeStr)) {
    return "matia" as const
  }

  const signal = [
    order.order_type,
    order.hcpcs_code,
    order.hcpcs,
    ...(order.hcpcs_codes || []),
    order.source_channel,
    order.source_reference,
    order.patient_name,
    order.first_name,
    order.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (
    signal.includes("matia") ||
    signal.includes("mobility") ||
    signal.includes("wheelchair") ||
    signal.includes("power chair") ||
    signal.includes("crt") ||
    signal.includes("k08")
  ) {
    return "matia" as const
  }

  if (
    signal.includes("biolog") ||
    signal.includes("amniotic") ||
    signal.includes("graft") ||
    signal.includes("allograft") ||
    signal.includes("tissue matrix")
  ) {
    return "biologics" as const
  }

  if (
    signal.includes("implant") ||
    signal.includes("stimulator") ||
    signal.includes("replacement") ||
    signal.includes("fusion") ||
    signal.includes("arthro") ||
    signal.includes("surgical")
  ) {
    return "implants" as const
  }

  return "dme" as const
}

/** Matia pipeline rows + anything on the Matia / chair line (single SKU family). */
function isMatiaChairProductLine(order: OrderRecord): boolean {
  if (order.id.startsWith("matia-")) return true
  return inferBusinessLine(order) === "matia"
}

function buildPatientAggregates(
  orders: OrderRecord[],
  denialsByOrderId: Map<string, DenialRecord[]>,
) {
  const kanbanPatients = new Map<string, PatientStageAggregate & { codeCounts: Map<string, number> }>()
  const accountPatients = new Map<string, PatientAccountAggregate>()

  for (const order of orders) {
    const patientId = order.patient_id || order.id
    const realPatientId = getRealPatientId(order)
    const patientKey = getPatientKey(order)
    const stage = getColumnId(order.status)
    const stageKey = `${patientKey}::${stage}`
    const amount = getOrderAmount(order, denialsByOrderId)
    const code =
      order.hcpcs_code ||
      order.hcpcs ||
      order.hcpcs_codes?.[0] ||
      order.order_type ||
      "Order"
    const due = (order.updated_at || order.created_at || new Date().toISOString()).slice(0, 10)
    const payer = order.payer_name || order.payer || order.payer_id || "Unknown"
    const name = getPatientName(order)
    const orderPriority = getPriority(order, amount || 0)
    const businessLine = inferBusinessLine(order)

    const existingStage = kanbanPatients.get(stageKey)
    if (!existingStage) {
      const codeCounts = new Map<string, number>()
      codeCounts.set(code, 1)
      kanbanPatients.set(stageKey, {
        id: `${patientId}:${stage}`,
        patientId,
        realPatientId,
        businessLine,
        name,
        payer,
        stage,
        amount,
        orderCount: 1,
        priority: orderPriority,
        assignee: getAssignee(order),
        due,
        topCode: code,
        orderIds: [order.id],
        locked: false,
        codeCounts,
      })
    } else {
      existingStage.orderCount += 1
      existingStage.amount =
        existingStage.amount || amount ? (existingStage.amount || 0) + (amount || 0) : null
      if (orderPriority === "high" || (orderPriority === "med" && existingStage.priority === "low")) {
        existingStage.priority = orderPriority
      }
      if (due > existingStage.due) {
        existingStage.due = due
        existingStage.assignee = getAssignee(order)
      }
      if (!existingStage.realPatientId && realPatientId) {
        existingStage.realPatientId = realPatientId
      }
      existingStage.codeCounts.set(code, (existingStage.codeCounts.get(code) || 0) + 1)
      existingStage.orderIds.push(order.id)
      const nextTopCode = Array.from(existingStage.codeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
      if (nextTopCode) existingStage.topCode = nextTopCode
    }

    const existingAccount = accountPatients.get(patientKey)
    if (!existingAccount) {
      accountPatients.set(patientKey, {
        id: patientId.slice(0, 8).toUpperCase(),
        patientId,
        realPatientId,
        businessLine,
        name,
        payer,
        stage,
        amount,
        orderCount: 1,
        topCode: code,
      })
      continue
    }

    existingAccount.orderCount += 1
    existingAccount.amount =
      existingAccount.amount || amount ? (existingAccount.amount || 0) + (amount || 0) : null
    if (!existingAccount.realPatientId && realPatientId) {
      existingAccount.realPatientId = realPatientId
    }
    if (PATIENT_STAGE_PRIORITY[stage] > PATIENT_STAGE_PRIORITY[existingAccount.stage]) {
      existingAccount.stage = stage
    }
  }

  return {
    kanbanPatients: Array.from(kanbanPatients.values()),
    accountPatients: Array.from(accountPatients.values()),
  }
}

function getStageLock(orders: OrderRecord[], stage: string) {
  if (stage !== "intake" && stage !== "prior_auth") {
    return { locked: false as const, reason: undefined }
  }

  const missingSwo = orders.some((order) => (order.swo_status || "").toLowerCase() !== "ingested")
  if (missingSwo) {
    return {
      locked: true as const,
      reason: "SWO must be created, sent, and returned before this patient can move out of intake.",
    }
  }

  return { locked: false as const, reason: undefined }
}

export function buildDashboardData(orders: OrderRecord[], denials: DenialRecord[], opts?: DashboardBuildOptions) {
  const denialsByOrderId = new Map<string, DenialRecord[]>()
  for (const denial of denials) {
    if (!denial.order_id) continue
    const current = denialsByOrderId.get(denial.order_id) || []
    current.push(denial)
    denialsByOrderId.set(denial.order_id, current)
  }

  const kanban = structuredClone(EMPTY_COLUMNS)
  const { kanbanPatients, accountPatients } = buildPatientAggregates(orders, denialsByOrderId)

  let deniedCount = 0
  let totalAmount = 0

  for (const patient of kanbanPatients) {
    const groupedOrders = orders.filter((order) => patient.orderIds.includes(order.id))
    const stageGate = getStageLock(groupedOrders, patient.stage)
    const card: KanbanCard = {
      id: patient.id,
      patientId: patient.realPatientId || undefined,
      businessLine: patient.businessLine,
      title: patient.name,
      value: formatAmountDisplay(patient.amount),
      priority: patient.priority,
      assignee: patient.assignee,
      payer: patient.payer,
      type: [getHcpcsShortDescription(patient.topCode), `${patient.orderCount} ${patient.orderCount === 1 ? "order" : "orders"}`]
        .filter(Boolean)
        .join(" · "),
      due: patient.due,
      orderCount: patient.orderCount,
      href: patient.realPatientId ? `/patients/${patient.realPatientId}` : undefined,
      orderIds: patient.orderIds,
      locked: stageGate.locked,
      lockReason: stageGate.reason,
    }

    kanban[patient.stage].cards.push(card)
    totalAmount += patient.amount || 0

    if (patient.stage === "denied" || patient.stage === "appealed") deniedCount += 1
  }

  const accounts = accountPatients
    .map((patient) => {
      const accountStatus: AccountRecord["status"] =
        patient.stage === "denied"
          ? "denied"
          : patient.stage === "appealed"
            ? "appeal"
            : patient.stage !== "paid"
              ? "pending"
              : "active"

      return {
        id: patient.id,
        businessLine: patient.businessLine,
        name: patient.name,
        payer: patient.payer,
        status: accountStatus,
        value: formatAmountDisplay(patient.amount),
        type: `${patient.orderCount} ${patient.orderCount === 1 ? "order" : "orders"} · ${patient.topCode}`,
        orderCount: patient.orderCount,
        href: patient.realPatientId ? `/patients/${patient.realPatientId}` : undefined,
      }
    })
    .sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0))

  const pipeline = Object.fromEntries(
    Object.keys(COLUMN_META).map((columnId) => {
      const cards = kanban[columnId].cards
      const total = cards.reduce((sum, card) => {
        const numeric = Number.parseFloat(card.value.replace(/[$,]/g, ""))
        return sum + (Number.isFinite(numeric) ? numeric : 0)
      }, 0)

      return [
        columnId,
        {
          count: cards.length,
          value: total > 0 ? toCurrency(total) : cards.length ? "Pending" : "$0",
        },
      ]
    }),
  ) as Record<string, { count: number; value: string }>

  const urgentOrders = orders.filter((order) => getPriority(order, getOrderAmount(order, denialsByOrderId) || 0) === "high").length

  const appeals = opts?.appeals ?? []
  const integrations = opts?.integrations
  const cleanClaimRate = computeCleanClaimProxy(orders)
  const daysInAR = computeDaysInAR(orders)
  const appealWinRate = computeAppealWinRate(appeals)

  return {
    initialKPIs: {
      cleanClaimRate,
      daysInAR,
      appealWinRate,
      outstandingOrders: {
        value: orders.length,
        urgent: urgentOrders,
        trend: totalAmount > 0 ? "up" : "neutral",
      },
    },
    initialPipeline: pipeline,
    initialAccounts: accounts,
    initialSystemState: buildSystemState(orders, integrations),
    initialKanban: kanban,
  }
}

export async function getLiveDashboardData() {
  const session = await getSafeServerSession()

  if (!session?.user?.accessToken) {
    redirect("/login")
  }

  const headers = {
    Authorization: `Bearer ${session.user.accessToken}`,
    "Content-Type": "application/json",
  }

  const [ordersRes, denialsRes, appealsRes, communicationsRes, integrationsRes] = await Promise.all([
    fetchCoreJson("/orders?limit=200", headers),
    fetchCoreJson("/denials?limit=200", headers),
    fetchCoreJson("/appeals?limit=200", headers),
    fetchCoreJson("/communications/feed?limit=30", headers),
    fetchCoreJson("/integrations/status", headers),
  ])

  if (!ordersRes || !ordersRes.ok) {
    const statusCode = ordersRes?.status
    if (statusCode === 401 || statusCode === 403) {
      redirect("/login?session_expired=true")
    }

    console.warn(
      `Dashboard data unavailable from core orders endpoint${
        statusCode ? ` (status ${statusCode})` : ""
      }. Falling back to empty dashboard state.`,
    )

    const fallback = buildDashboardData([], [])
    return {
      ...fallback,
      initialCommunications: [],
      initialIntegrations: UNKNOWN_INTEGRATIONS,
    }
  }

  const ordersPayload = (await ordersRes.json()) as {
    orders?: OrderRecord[]
  }
  const denialsPayload =
    denialsRes && denialsRes.ok
      ? ((await denialsRes.json()) as { denials?: DenialRecord[] })
      : null
  const appealsPayload =
    appealsRes && appealsRes.ok ? ((await appealsRes.json()) as { appeals?: AppealRecord[] }) : null
  const communicationsPayload =
    communicationsRes && communicationsRes.ok
      ? ((await communicationsRes.json()) as { items?: Array<Record<string, unknown>> })
      : null
  const integrationsPayload =
    integrationsRes && integrationsRes.ok
      ? ((await integrationsRes.json()) as Record<string, unknown>)
      : null

  const matiaOrders = await fetchMatiaPipelineAsOrders(session.user.accessToken)
  let mergedOrders = [...(ordersPayload.orders || []), ...matiaOrders]

  // Reps only see patients assigned to them
  if (session.user.role === "rep" && session.user.id) {
    const repId = session.user.id
    const assignedPatientIds = new Set(
      mergedOrders
        .filter((o) => o.assigned_to_user_id === repId)
        .map((o) => o.patient_id)
        .filter(Boolean),
    )
    mergedOrders = mergedOrders.filter((o) => assignedPatientIds.has(o.patient_id))
  }

  const base = buildDashboardData(mergedOrders, denialsPayload?.denials || [], {
    appeals: appealsPayload?.appeals || [],
    integrations: integrationsPayload ?? undefined,
  })
  return {
    ...base,
    initialCommunications: communicationsPayload?.items || [],
    initialIntegrations: integrationsPayload || UNKNOWN_INTEGRATIONS,
  }
}
