import { getSafeServerSession } from "@/lib/auth"
import { availityServiceBaseUrl } from "@/lib/availity-upstream"
import { getRequiredEnv, getServiceBaseUrl } from "@/lib/runtime-config"

type WorkflowKey = "intake" | "poseidon" | "trident" | "execution" | "revenue" | "ledger"
type MetricKey =
  | "open_cases"
  | "missing_docs"
  | "trident_review"
  | "ready_fulfillment"
  | "pod_needed"
  | "revenue_support"
  | "tebra_ready"
  | "high_risk"

type SourceKey = "core_orders" | "core_billing" | "edi_revenue" | "edi_claims" | "availity"

export type SpearSourceStatus = {
  key: SourceKey
  label: string
  ok: boolean
  status?: number
  message?: string
}

export type SpearCommandData = {
  workflow: Record<WorkflowKey, { count: number; active: boolean }>
  metrics: Record<MetricKey, number>
  poseidon: {
    total_records: number
    storage_used: string
    last_sync: string
  }
  trident: {
    cases_reviewed: number
    risk_flags: number
    next_actions: number
  }
  spear_execution: {
    active_tasks: number
    fulfillment_pending: number
    completed_today: number
  }
  revenue_support: {
    tebra_ready: number
    packet_prep: number
    revenue_at_risk: number
  }
  diagnostics: {
    generated_at: string
    degraded: boolean
    sources: SpearSourceStatus[]
  }
}

type OrderRow = Record<string, unknown>

type FetchOutcome<T> = {
  ok: boolean
  status?: number
  data?: T
  message?: string
}

const CLOSED_STATUSES = new Set(["paid", "closed", "cancelled", "canceled", "archived", "complete"])
const INTAKE_STATUSES = new Set(["draft", "intake", "eligibility_check", "eligibility_failed"])
const FULFILLMENT_READY_STATUSES = new Set(["auth_approved", "ready_to_submit", "authorized"])
const REVENUE_STATUSES = new Set([
  "submitted",
  "pending_payment",
  "partial_payment",
  "denied",
  "appeal_pending",
  "appeal_submitted",
])
const BILLING_REVIEW_STATUSES = new Set([
  "ready_for_scrub",
  "queued_for_api",
  "queued_for_third_party",
  "claim_validated",
])

function emptyCommandData(sources: SpearSourceStatus[] = []): SpearCommandData {
  const generatedAt = new Date().toISOString()
  return {
    workflow: {
      intake: { count: 0, active: false },
      poseidon: { count: 0, active: false },
      trident: { count: 0, active: false },
      execution: { count: 0, active: false },
      revenue: { count: 0, active: false },
      ledger: { count: 0, active: false },
    },
    metrics: {
      open_cases: 0,
      missing_docs: 0,
      trident_review: 0,
      ready_fulfillment: 0,
      pod_needed: 0,
      revenue_support: 0,
      tebra_ready: 0,
      high_risk: 0,
    },
    poseidon: {
      total_records: 0,
      storage_used: "Unavailable",
      last_sync: "No live sync",
    },
    trident: {
      cases_reviewed: 0,
      risk_flags: 0,
      next_actions: 0,
    },
    spear_execution: {
      active_tasks: 0,
      fulfillment_pending: 0,
      completed_today: 0,
    },
    revenue_support: {
      tebra_ready: 0,
      packet_prep: 0,
      revenue_at_risk: 0,
    },
    diagnostics: {
      generated_at: generatedAt,
      degraded: sources.some((source) => !source.ok),
      sources,
    },
  }
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase()
}

function arrayLength(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.length : 0
    } catch {
      return 0
    }
  }
  return 0
}

function numeric(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function isToday(value: unknown): boolean {
  if (!value) return false
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return date.toDateString() === now.toDateString()
}

function getOrders(payload: unknown): OrderRow[] {
  if (!payload || typeof payload !== "object") return []
  const record = payload as Record<string, unknown>
  const candidates = [record.orders, record.items, record.results, record.data]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((item): item is OrderRow => !!item && typeof item === "object")
  }
  return []
}

function getTotal(payload: unknown, fallback: number): number {
  if (!payload || typeof payload !== "object") return fallback
  const record = payload as Record<string, unknown>
  return numeric(record.total ?? record.count ?? record.total_records) || fallback
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs = 8000,
): Promise<FetchOutcome<T>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    })
    const text = await res.text()
    let data: unknown = {}
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = { raw: text.slice(0, 500) }
      }
    }
    if (!res.ok) {
      const detail =
        data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error)
          : `HTTP ${res.status}`
      return { ok: false, status: res.status, data: data as T, message: detail }
    }
    return { ok: true, status: res.status, data: data as T }
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Request timed out"
      : error instanceof Error
        ? error.message
        : "Request failed"
    return { ok: false, message }
  } finally {
    clearTimeout(timeout)
  }
}

function sourceStatus<T>(
  key: SourceKey,
  label: string,
  outcome: FetchOutcome<T>,
): SpearSourceStatus {
  return {
    key,
    label,
    ok: outcome.ok,
    status: outcome.status,
    message: outcome.ok ? undefined : outcome.message || "Dependency unavailable",
  }
}

function unavailableSource(key: SourceKey, label: string, message: string): SpearSourceStatus {
  return { key, label, ok: false, message }
}

function ediHeaders(): Record<string, string> {
  const key =
    process.env.EDI_INTERNAL_API_KEY?.trim() ||
    process.env.INTERNAL_API_KEY?.trim() ||
    getRequiredEnv("INTERNAL_API_KEY")
  return {
    "Content-Type": "application/json",
    "X-Internal-API-Key": key,
  }
}

function deriveCommandData(params: {
  ordersPayload: unknown
  billingPayload: unknown
  remittancePayload: unknown
  claimPayload: unknown
  sources: SpearSourceStatus[]
}): SpearCommandData {
  const orders = getOrders(params.ordersPayload)
  const billingQueue =
    params.billingPayload && typeof params.billingPayload === "object"
      ? getOrders(params.billingPayload)
      : []
  const claimPayload = params.claimPayload as { total?: number; submissions?: Array<Record<string, unknown>> } | undefined
  const remittancePayload = params.remittancePayload as
    | { summary?: { total_claims?: number; total_denials?: number } }
    | undefined

  const openOrders = orders.filter((order) => !CLOSED_STATUSES.has(normalize(order.status)))
  const intake = orders.filter((order) => INTAKE_STATUSES.has(normalize(order.status))).length
  const poseidonStored = getTotal(params.ordersPayload, orders.length)

  const missingDocs = orders.filter((order) => {
    const status = normalize(order.status)
    const swo = normalize(order.swo_status)
    const pod = normalize(order.pod_status)
    const docsPending = status === "documents_pending" || status === "physician_signature"
    const needsSwo = ["pending_auth", "auth_approved", "ready_to_submit"].includes(status) && swo !== "ingested"
    const needsPod = normalize(order.fulfillment_status) === "delivered" && pod !== "received"
    return docsPending || needsSwo || needsPod
  }).length

  const highRisk = orders.filter((order) => {
    const riskTier = normalize(order.risk_tier)
    const score = numeric(order.denial_risk_score)
    return ["high", "blocked", "critical"].includes(riskTier) || score >= 0.7
  }).length

  const tridentReview = orders.filter((order) => {
    const status = normalize(order.status)
    return (
      status === "pending_auth" ||
      status === "auth_denied" ||
      status === "denied" ||
      arrayLength(order.trident_flags) > 0 ||
      numeric(order.denial_risk_score) > 0
    )
  }).length

  const readyFulfillment = orders.filter((order) => {
    const fulfillment = normalize(order.fulfillment_status)
    return FULFILLMENT_READY_STATUSES.has(normalize(order.status)) && !["placed", "delivered"].includes(fulfillment)
  }).length

  const fulfillmentPending = orders.filter((order) => {
    const fulfillment = normalize(order.fulfillment_status)
    return ["draft", "placed", "in_transit", "pending", "ordered"].includes(fulfillment)
  }).length

  const podNeeded = orders.filter((order) => {
    const delivered = !!order.delivered_at || normalize(order.fulfillment_status) === "delivered"
    return delivered && normalize(order.pod_status) !== "received"
  }).length

  const revenueSupport = orders.filter((order) => {
    const status = normalize(order.status)
    const billing = normalize(order.billing_status)
    return REVENUE_STATUSES.has(status) || BILLING_REVIEW_STATUSES.has(billing)
  }).length

  const tebraReady = orders.filter((order) => normalize(order.billing_status) === "queued_for_third_party").length
  const packetPrep = billingQueue.length || orders.filter((order) => normalize(order.billing_status) === "ready_for_scrub").length
  const revenueAtRisk = orders.filter((order) => {
    const denied = normalize(order.status) === "denied" || numeric(order.denied_amount) > 0
    return denied || numeric(order.denial_risk_score) >= 0.7
  }).length
  const completedToday = orders.filter((order) => CLOSED_STATUSES.has(normalize(order.status)) && isToday(order.updated_at)).length
  const submittedClaims = getTotal(params.claimPayload, claimPayload?.submissions?.length ?? 0)
  const remittanceClaims = numeric(remittancePayload?.summary?.total_claims)
  const ledgerCount = Math.max(submittedClaims, remittanceClaims)

  const metrics: SpearCommandData["metrics"] = {
    open_cases: openOrders.length,
    missing_docs: missingDocs,
    trident_review: tridentReview,
    ready_fulfillment: readyFulfillment,
    pod_needed: podNeeded,
    revenue_support: revenueSupport,
    tebra_ready: tebraReady,
    high_risk: highRisk,
  }

  return {
    workflow: {
      intake: { count: intake, active: intake > 0 },
      poseidon: { count: poseidonStored, active: poseidonStored > 0 },
      trident: { count: tridentReview, active: tridentReview > 0 },
      execution: { count: fulfillmentPending, active: fulfillmentPending > 0 },
      revenue: { count: revenueSupport + packetPrep, active: revenueSupport + packetPrep > 0 },
      ledger: { count: ledgerCount, active: ledgerCount > 0 },
    },
    metrics,
    poseidon: {
      total_records: poseidonStored,
      storage_used: "Tracked externally",
      last_sync: params.sources.find((source) => source.key === "core_orders")?.ok
        ? new Date().toISOString()
        : "Core unavailable",
    },
    trident: {
      cases_reviewed: tridentReview,
      risk_flags: highRisk + missingDocs,
      next_actions: missingDocs + readyFulfillment + podNeeded + packetPrep,
    },
    spear_execution: {
      active_tasks: openOrders.length,
      fulfillment_pending: fulfillmentPending,
      completed_today: completedToday,
    },
    revenue_support: {
      tebra_ready: tebraReady,
      packet_prep: packetPrep,
      revenue_at_risk: revenueAtRisk,
    },
    diagnostics: {
      generated_at: new Date().toISOString(),
      degraded: params.sources.some((source) => !source.ok),
      sources: params.sources,
    },
  }
}

export async function getSpearCommandData(): Promise<SpearCommandData> {
  const session = await getSafeServerSession()
  if (!session?.user?.accessToken) {
    return emptyCommandData([
      unavailableSource("core_orders", "Core Orders", "Unauthorized session"),
      unavailableSource("core_billing", "Core Billing Queue", "Unauthorized session"),
      unavailableSource("edi_revenue", "EDI Remittance", "Unauthorized session"),
      unavailableSource("edi_claims", "EDI Claims", "Unauthorized session"),
      unavailableSource("availity", "Availity Prior Auth", "Unauthorized session"),
    ])
  }

  const headers = {
    Authorization: `Bearer ${session.user.accessToken}`,
    "Content-Type": "application/json",
  }

  let coreBase: string | null = null
  let ediBase: string | null = null
  let ediHeaderMap: Record<string, string> | null = null
  let availityBase: string | null = null

  try {
    coreBase = getServiceBaseUrl("POSEIDON_API_URL")
  } catch {
    coreBase = null
  }

  try {
    ediBase = getServiceBaseUrl("EDI_API_URL")
    ediHeaderMap = ediHeaders()
  } catch {
    ediBase = null
    ediHeaderMap = null
  }

  try {
    availityBase = availityServiceBaseUrl()
  } catch {
    availityBase = null
  }

  const [ordersOutcome, billingOutcome, remittanceOutcome, claimsOutcome, availityOutcome] =
    await Promise.all([
      coreBase
        ? fetchJson<unknown>(`${coreBase}/api/v1/orders?limit=500`, { headers })
        : Promise.resolve<FetchOutcome<unknown>>({ ok: false, message: "POSEIDON_API_URL unavailable" }),
      coreBase
        ? fetchJson<unknown>(`${coreBase}/billing/review-queue?limit=100`, { headers })
        : Promise.resolve<FetchOutcome<unknown>>({ ok: false, message: "POSEIDON_API_URL unavailable" }),
      ediBase && ediHeaderMap
        ? fetchJson<unknown>(`${ediBase}/api/v1/remittance/stats?days=30`, { headers: ediHeaderMap })
        : Promise.resolve<FetchOutcome<unknown>>({ ok: false, message: "EDI service unavailable" }),
      ediBase && ediHeaderMap
        ? fetchJson<unknown>(`${ediBase}/api/v1/claims/submissions?limit=100`, { headers: ediHeaderMap })
        : Promise.resolve<FetchOutcome<unknown>>({ ok: false, message: "EDI service unavailable" }),
      availityBase
        ? fetchJson<unknown>(`${availityBase}/api/integrations/availity/health`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          })
        : Promise.resolve<FetchOutcome<unknown>>({ ok: false, message: "AVAILITY_SERVICE_URL unavailable" }),
    ])

  const sources: SpearSourceStatus[] = [
    sourceStatus("core_orders", "Core Orders", ordersOutcome),
    sourceStatus("core_billing", "Core Billing Queue", billingOutcome),
    sourceStatus("edi_revenue", "EDI Remittance", remittanceOutcome),
    sourceStatus("edi_claims", "EDI Claims", claimsOutcome),
    sourceStatus("availity", "Availity Prior Auth", availityOutcome),
  ]

  return deriveCommandData({
    ordersPayload: ordersOutcome.ok ? ordersOutcome.data : undefined,
    billingPayload: billingOutcome.ok ? billingOutcome.data : undefined,
    remittancePayload: remittanceOutcome.ok ? remittanceOutcome.data : undefined,
    claimPayload: claimsOutcome.ok ? claimsOutcome.data : undefined,
    sources,
  })
}
