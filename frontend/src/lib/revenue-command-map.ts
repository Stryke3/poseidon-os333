/** Maps Core orders + communications feed into RevenueCommandSurface models. */

export type RevenueStageKey =
  | "intake"
  | "eligibility"
  | "auth"
  | "submitted"
  | "pending"
  | "denied"
  | "paid"

export type RevenueCheckKey = "swo" | "notes" | "ins" | "cmn"

export type RevenueEventType = "ops" | "case" | "intel"

export type RevenueCommandPatient = {
  id: string
  name: string
  dob: string
  mrn: string
  payer: string
  mid: string
  hcpcs: string
  dx: string
  product: string
  doc: string
  npi: string
  stage: RevenueStageKey
  tri: number
  ar: number
  amt: number
  surg: string | null
  org: string
  checks: Record<RevenueCheckKey, boolean>
}

export type RevenueCalendarEvent = {
  id: number
  t: string
  time: string
  dur: number
  type: RevenueEventType
  date: string
  who: string
}

type OrderLike = Record<string, unknown>

function norm(s?: string) {
  return (s || "").toLowerCase().trim()
}

function parseMoney(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  const n = Number.parseFloat(String(v ?? ""))
  return Number.isFinite(n) ? n : 0
}

function parseTsMs(s?: string | null): number | null {
  if (!s) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

function daysOpen(order: OrderLike): number {
  const start = parseTsMs(String(order.updated_at ?? order.created_at ?? ""))
  if (!start) return 0
  return Math.max(0, Math.round((Date.now() - start) / 86_400_000))
}

function firstHcpcs(order: OrderLike): string {
  const codes = order.hcpcs_codes
  if (Array.isArray(codes) && codes[0]) return String(codes[0])
  return String(order.hcpcs_code ?? order.hcpcs ?? "—")
}

function orderAmount(order: OrderLike): number {
  const v =
    parseMoney(order.total_billed) ||
    parseMoney(order.expected_amount) ||
    parseMoney(order.billed_amount) ||
    parseMoney(order.paid_amount) ||
    parseMoney(order.total_paid)
  return Math.round(v)
}

export function orderStageToRevenueStage(order: OrderLike): RevenueStageKey {
  const s = norm(String(order.status ?? ""))
  if (["paid", "closed"].includes(s)) return "paid"
  if (s === "denied") return "denied"
  if (s === "appealed") return "pending"
  if (["submitted", "processing", "pending_review"].includes(s)) return "submitted"
  if (["pending_pay", "pending pay"].includes(s)) return "pending"
  if (
    ["authorized", "approved", "prior_auth", "prior auth", "pending_auth", "pending auth"].includes(s)
  ) {
    return "auth"
  }
  const e = norm(String(order.eligibility_status ?? ""))
  if (e && !["verified", "active", "eligible", "approved"].includes(e)) return "eligibility"
  if (["draft", "new", "intake", "evaluation", "documentation"].includes(s)) return "intake"
  return "intake"
}

function heuristicTri(order: OrderLike): number {
  const p = norm(String(order.priority ?? ""))
  if (p === "high" || p === "urgent") return 88
  const amt = orderAmount(order)
  if (amt >= 5000) return 82
  if (amt >= 1500) return 74
  return 68
}

export function mapOrderToRevenuePatient(order: OrderLike): RevenueCommandPatient {
  const id = String(order.id ?? "")
  const patientId = String(order.patient_id ?? id)
  const combined = [order.first_name, order.last_name].filter(Boolean).join(" ").trim()
  const name = String(order.patient_name ?? (combined || "Unknown"))
  const payer = String(order.payer_name ?? order.payer ?? "Unknown")
  const hcpcs = firstHcpcs(order)
  const swoOk = norm(String(order.swo_status ?? "")) === "ingested"
  const elig = norm(String(order.eligibility_status ?? ""))
  const insOk = elig === "verified" || elig === "active" || elig === "eligible" || elig === "approved"

  return {
    id,
    name,
    dob: order.dob ? String(order.dob).slice(0, 10) : "",
    mrn: patientId.slice(0, 12),
    payer,
    mid: String(order.payer_id ?? patientId).slice(0, 14),
    hcpcs,
    dx: "—",
    product: hcpcs !== "—" ? `HCPCS ${hcpcs}` : String(order.order_type ?? "Order"),
    doc: "—",
    npi: "—",
    stage: orderStageToRevenueStage(order),
    tri: heuristicTri(order),
    ar: daysOpen(order),
    amt: Math.max(0, orderAmount(order)),
    surg: order.delivered_at ? String(order.delivered_at).slice(0, 10) : null,
    org: String(order.source_channel ?? "Core").slice(0, 12),
    checks: {
      swo: swoOk,
      notes: true,
      ins: insOk,
      cmn: norm(String(order.billing_status ?? "")) !== "",
    },
  }
}

type FeedItem = Record<string, unknown>

function extractTime(iso?: string): string {
  if (!iso) return "09:00"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "09:00"
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
}

export function mapCommunicationsToEvents(items: FeedItem[], startId = 1): RevenueCalendarEvent[] {
  return items
    .map((item, i) => {
      const created = String(item.created_at ?? "")
      const date = created.slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
      const title = String(item.title ?? item.body ?? "Team update").slice(0, 80)
      const subtype = norm(String(item.subtype ?? item.item_type ?? ""))
      const type: RevenueEventType =
        subtype.includes("case") || subtype.includes("order") ? "case" : subtype.includes("intel") ? "intel" : "ops"
      return {
        id: startId + i,
        t: title,
        time: extractTime(created),
        dur: 30,
        type,
        date,
        who: String(item.actor_name ?? "Team"),
      }
    })
    .filter((e): e is RevenueCalendarEvent => e !== null)
}

export function cleanClaimPctFromOrders(orders: OrderLike[]): number {
  const paid = orders.filter((o) => ["paid", "closed"].includes(norm(String(o.status ?? "")))).length
  const denied = orders.filter((o) => norm(String(o.status ?? "")) === "denied").length
  const denom = paid + denied
  if (denom === 0) return 0
  return Math.round((100 * paid) / denom)
}
