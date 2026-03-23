import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import { authOptions } from "@/lib/auth"
import { getHcpcsShortDescription } from "@/lib/hcpcs"
import type { AccountRecord, KanbanCard, KanbanColumn } from "@/lib/data"

const CORE_API_URL =
  process.env.POSEIDON_API_URL || process.env.CORE_API_URL || "http://poseidon_core:8001"
const MATIA_API_URL =
  process.env.MATIA_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://matia.strykefox.com"
    : "http://127.0.0.1:8010")

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
  eligibility_status?: string
  swo_status?: string
  billing_status?: string
  paid_amount?: number | string
  total_paid?: number | string
  total_billed?: number | string
  payment_date?: string
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

type MatiaPipelineRecord = {
  id: number | string
  patient_name?: string
  hcpcs?: string | null
  wheelchair_type?: string | null
  payer?: string | null
  stage?: string | null
  priority?: string | null
  amount?: number | string | null
  next_action?: string | null
  created_at?: string
}

const COLUMN_META: Record<string, { label: string; color: string }> = {
  pendingAuth: { label: "Pending Auth", color: "#c9921a" },
  authorized: { label: "Authorized", color: "#1a6ef5" },
  submitted: { label: "Submitted", color: "#0d9eaa" },
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
  pendingAuth: 4,
  submitted: 3,
  authorized: 2,
  paid: 1,
}

type PatientStageAggregate = {
  id: string
  patientId: string
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
  businessLine: "dme" | "implants" | "biologics" | "matia"
  name: string
  payer: string
  stage: string
  amount: number | null
  orderCount: number
  topCode: string
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
    case "evaluation":
    case "documentation":
    case "pending":
    case "pending_auth":
    case "pending auth":
      return "pendingAuth"
    case "prior_auth":
    case "prior auth":
    case "authorized":
    case "approved":
      return "authorized"
    case "submitted":
    case "pending_pay":
    case "pending pay":
    case "processing":
    case "pending_review":
      return "submitted"
    case "denied":
    case "write_off":
      return "denied"
    case "appealed":
      return "appealed"
    case "paid":
    case "closed":
      return "paid"
    default:
      return "pendingAuth"
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

function mapMatiaPipelineToOrders(records: MatiaPipelineRecord[]): OrderRecord[] {
  return records.map((record) => {
    const patientId = `matia-${record.id}`
    return {
      id: `matia-${record.id}`,
      patient_id: patientId,
      patient_name: record.patient_name || `Matia Patient ${record.id}`,
      payer_name: record.payer || "Unknown",
      hcpcs_code: record.hcpcs || undefined,
      order_type:
        record.wheelchair_type === "power" || record.wheelchair_type === "manual"
          ? `Matia ${record.wheelchair_type} wheelchair`
          : "Matia mobility",
      status: record.stage || "intake",
      expected_amount: record.amount ?? undefined,
      priority: record.priority || undefined,
      assigned_to: "MT",
      updated_at: record.created_at,
      created_at: record.created_at,
    }
  })
}

function buildPatientAggregates(
  orders: OrderRecord[],
  denialsByOrderId: Map<string, DenialRecord[]>,
) {
  const kanbanPatients = new Map<string, PatientStageAggregate & { codeCounts: Map<string, number> }>()
  const accountPatients = new Map<string, PatientAccountAggregate>()

  for (const order of orders) {
    const patientId = order.patient_id || order.id
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
  if (stage !== "pendingAuth" && stage !== "authorized") {
    return { locked: false as const, reason: undefined }
  }

  const missingEligibility = orders.some((order) => (order.eligibility_status || "").toLowerCase() !== "eligible")
  if (missingEligibility) {
    return {
      locked: true as const,
      reason: "Eligibility must be verified through Availity before this patient can move forward.",
    }
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

export function buildDashboardData(orders: OrderRecord[], denials: DenialRecord[]) {
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
      patientId: patient.patientId,
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
      href: `/patients/${patient.patientId}`,
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
            : patient.stage === "pendingAuth"
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
        href: `/patients/${patient.patientId}`,
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

  return {
    initialKPIs: {
      cleanClaimRate: {
        value: orders.length ? Math.max(0, Math.round(((orders.length - deniedCount) / orders.length) * 1000) / 10) : 100,
        delta: `${deniedCount} denied`,
        trend: deniedCount ? "down" : "up",
      },
      daysInAR: {
        value: 0,
        delta: "Live queue",
        trend: "neutral",
      },
      appealWinRate: {
        value: 0,
        delta: `${denials.length} denials tracked`,
        trend: "neutral",
      },
      outstandingOrders: {
        value: orders.length,
        urgent: urgentOrders,
        trend: totalAmount > 0 ? "up" : "neutral",
      },
    },
    initialPipeline: pipeline,
    initialAccounts: accounts,
    initialSystemState: {
      status: orders.length ? "operational" : "connected",
      services: ["Core API", "Dashboard"],
      ports: "443",
      operators: ["Admin", "Billing", "Rep"],
      lastSync: new Date().toISOString(),
    },
    initialKanban: kanban,
  }
}

export async function getLiveDashboardData() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.accessToken) {
    redirect("/login")
  }

  const headers = {
    Authorization: `Bearer ${session.user.accessToken}`,
    "Content-Type": "application/json",
  }

  const [ordersRes, denialsRes, communicationsRes, integrationsRes] = await Promise.all([
    fetch(`${CORE_API_URL}/orders?limit=200`, {
      headers,
      cache: "no-store",
    }).catch(() => null),
    fetch(`${CORE_API_URL}/denials?limit=200`, {
      headers,
      cache: "no-store",
    }).catch(() => null),
    fetch(`${CORE_API_URL}/communications/feed?limit=30`, {
      headers,
      cache: "no-store",
    }).catch(() => null),
    fetch(`${CORE_API_URL}/integrations/status`, {
      headers,
      cache: "no-store",
    }).catch(() => null),
  ])

  if (!ordersRes || !ordersRes.ok) {
    const statusCode = ordersRes?.status
    if (statusCode === 401 || statusCode === 403) {
      redirect("/login")
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
      initialIntegrations: {
        email: { configured: false, provider: null },
        calendar: { configured: false, provider: null },
        in_app_push: { configured: true, sources: [] },
      },
    }
  }

  const ordersPayload = (await ordersRes.json()) as {
    orders?: OrderRecord[]
  }
  const denialsPayload =
    denialsRes && denialsRes.ok
      ? ((await denialsRes.json()) as { denials?: DenialRecord[] })
      : null
  const communicationsPayload =
    communicationsRes && communicationsRes.ok
      ? ((await communicationsRes.json()) as { items?: Array<Record<string, unknown>> })
      : null
  const integrationsPayload =
    integrationsRes && integrationsRes.ok
      ? ((await integrationsRes.json()) as Record<string, unknown>)
      : null
  const base = buildDashboardData(ordersPayload.orders || [], denialsPayload?.denials || [])
  return {
    ...base,
    initialCommunications: communicationsPayload?.items || [],
    initialIntegrations: integrationsPayload || {
      email: { configured: false, provider: null },
      calendar: { configured: false, provider: null },
      in_app_push: { configured: true, sources: [] },
    },
  }
}
