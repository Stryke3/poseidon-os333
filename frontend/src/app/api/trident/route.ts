import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")
const TRIDENT_API_URL = getServiceBaseUrl("TRIDENT_API_URL")

const TRIDENT_RL_WINDOW_MS = 60_000
const TRIDENT_RL_MAX = 30
const tridentRateState = new Map<string, { count: number; windowEnd: number }>()

function allowTridentRateLimit(key: string): boolean {
  const now = Date.now()
  const row = tridentRateState.get(key)
  if (!row || now > row.windowEnd) {
    tridentRateState.set(key, { count: 1, windowEnd: now + TRIDENT_RL_WINDOW_MS })
    return true
  }
  if (row.count >= TRIDENT_RL_MAX) return false
  row.count += 1
  return true
}

async function fetchCore(path: string, token: string) {
  const res = await fetch(`${CORE_API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  }).catch(() => null)
  if (!res?.ok) return null
  return res.json().catch(() => null)
}

type HistoricalHcpcsSummary = {
  sourceAsset: string
  rowCount: number
  topCodes: Array<{
    hcpcs: string
    count: number
    avgPaid: number
    avgAllowable: number
    avgBilled: number
  }>
}

async function fetchHistoricalHcpcsSummary(): Promise<HistoricalHcpcsSummary | null> {
  const catalogRes = await fetch(`${TRIDENT_API_URL}/data-modeling/catalog`, { cache: "no-store" }).catch(() => null)
  if (!catalogRes?.ok) return null
  const catalog = (await catalogRes.json().catch(() => null)) as
    | { files?: Array<{ asset_name?: string; dataset_kind?: string }> }
    | null
  const chargeAsset =
    catalog?.files?.find((f) => f.dataset_kind === "charge_detail_report")?.asset_name ||
    "Charges Billed or Sent to Bill (by DOS), L-code detail Report - 2021.01.01 - 2024.04.13.xlsx"

  const encoded = encodeURIComponent(chargeAsset)
  const normalizedRes = await fetch(
    `${TRIDENT_API_URL}/data-modeling/normalized-assets/${encoded}?limit=200000`,
    { cache: "no-store" },
  ).catch(() => null)
  if (!normalizedRes?.ok) return null

  const payload = (await normalizedRes.json().catch(() => null)) as
    | {
        records?: Array<{
          hcpcs_code?: string
          paid_amount?: number | string
          allowable_amount?: number | string
          billed_amount?: number | string
        }>
      }
    | null
  const records = payload?.records || []
  if (!records.length) return null

  const sums = new Map<string, { count: number; paid: number; allowable: number; billed: number }>()
  for (const row of records) {
    const code = (row.hcpcs_code || "").trim().toUpperCase() || "UNKNOWN"
    const paid = Number.parseFloat(String(row.paid_amount ?? 0)) || 0
    const allowable = Number.parseFloat(String(row.allowable_amount ?? 0)) || 0
    const billed = Number.parseFloat(String(row.billed_amount ?? 0)) || 0
    const prev = sums.get(code) || { count: 0, paid: 0, allowable: 0, billed: 0 }
    prev.count += 1
    prev.paid += paid
    prev.allowable += allowable
    prev.billed += billed
    sums.set(code, prev)
  }

  const topCodes = Array.from(sums.entries())
    .map(([hcpcs, v]) => ({
      hcpcs,
      count: v.count,
      avgPaid: v.count ? v.paid / v.count : 0,
      avgAllowable: v.count ? v.allowable / v.count : 0,
      avgBilled: v.count ? v.billed / v.count : 0,
    }))
    .sort((a, b) => b.avgPaid - a.avgPaid)
    .slice(0, 20)

  return {
    sourceAsset: chargeAsset,
    rowCount: records.length,
    topCodes,
  }
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString()}`
}

function buildInternalTridentResponse({
  prompt,
  orders,
  patients,
  kpisData,
  historicalSummary,
  context,
}: {
  prompt: string
  orders: Array<Record<string, unknown>>
  patients: Array<Record<string, unknown>>
  kpisData: Record<string, any> | null
  historicalSummary: HistoricalHcpcsSummary | null
  context: unknown
}): string {
  if (!orders.length && !patients.length && !kpisData) {
    return "Finding: live Poseidon data is unavailable right now. Risk: Trident cannot produce a grounded recommendation without a current Core snapshot. Recommended action: verify Core connectivity, then rerun the analysis."
  }

  const deniedOrders = orders.filter((o) => String(o.status || "").toLowerCase() === "denied").length
  const intakeOrders = orders.filter((o) => String(o.status || "").toLowerCase() === "intake").length
  const pendingAuthOrders = orders.filter((o) => String(o.status || "").toLowerCase().includes("auth")).length
  const totalBilled = orders.reduce(
    (sum, o) => sum + (Number.parseFloat(String(o.total_billed ?? 0)) || 0),
    0,
  )
  const totalPaid = orders.reduce(
    (sum, o) => sum + (Number.parseFloat(String(o.paid_amount ?? o.total_paid ?? 0)) || 0),
    0,
  )
  const totalDeniedAmount = orders.reduce(
    (sum, o) => sum + (Number.parseFloat(String(o.denied_amount ?? 0)) || 0),
    0,
  )

  const payerCounts = new Map<string, number>()
  const hcpcsCounts = new Map<string, number>()
  for (const order of orders) {
    const payer = String(order.payer_name || order.payer_id || "unknown").trim() || "unknown"
    payerCounts.set(payer, (payerCounts.get(payer) || 0) + 1)
    const codes = Array.isArray(order.hcpcs_codes) ? order.hcpcs_codes : [order.hcpcs_codes || "unknown"]
    for (const rawCode of codes) {
      const code = String(rawCode || "unknown").trim().toUpperCase() || "UNKNOWN"
      hcpcsCounts.set(code, (hcpcsCounts.get(code) || 0) + 1)
    }
  }

  const topPayerEntry = Array.from(payerCounts.entries()).sort((a, b) => b[1] - a[1])[0]
  const topHcpcsEntry = Array.from(hcpcsCounts.entries()).sort((a, b) => b[1] - a[1])[0]
  const denialRate = Number.parseFloat(String(kpisData?.orders?.denial_rate_pct ?? "")) || 0
  const revenueDenied = Number(kpisData?.revenue?.denied || totalDeniedAmount || 0)
  const revenueCollected = Number(kpisData?.revenue?.collected || totalPaid || 0)

  const lowerPrompt = prompt.toLowerCase()
  const focusPayer = Array.from(payerCounts.keys()).find((payer) => lowerPrompt.includes(payer.toLowerCase()))
  const focusHcpcs = Array.from(hcpcsCounts.keys()).find((code) => lowerPrompt.includes(code.toLowerCase()))
  const hasUiContext = Boolean(context && typeof context === "object")

  const findingParts = [
    `${orders.length} active orders and ${patients.length} patients are in the live snapshot`,
    denialRate > 0
      ? `denial rate is ${denialRate.toFixed(1)}%`
      : `${deniedOrders} orders are already sitting in denied status`,
    topPayerEntry ? `${topPayerEntry[0]} is the heaviest payer at ${topPayerEntry[1]} orders` : null,
    topHcpcsEntry ? `${topHcpcsEntry[0]} is the most common HCPCS at ${topHcpcsEntry[1]} orders` : null,
  ].filter(Boolean)

  const riskParts = [
    deniedOrders > 0 ? `${deniedOrders} denied orders need intervention` : null,
    pendingAuthOrders > 0 ? `${pendingAuthOrders} orders are still sitting in prior auth flow` : null,
    intakeOrders > 0 ? `${intakeOrders} orders remain at intake and can stall conversion` : null,
    revenueDenied > 0 ? `${formatMoney(revenueDenied)} is currently marked denied` : null,
    focusPayer ? `the prompt is focused on ${focusPayer}, so payer-specific rules should be reviewed first` : null,
    focusHcpcs ? `${focusHcpcs} appears in the current book and should be checked for documentation quality` : null,
    hasUiContext ? "dashboard context was included, so pipeline mix should be considered in prioritization" : null,
  ].filter(Boolean)

  const actionParts = [
    deniedOrders > 0 ? "work the denied queue first and attach the top CARC patterns to each appeal" : null,
    pendingAuthOrders > 0 ? "clear pending auth orders before they age into preventable denials" : null,
    topPayerEntry ? `review ${topPayerEntry[0]} documentation requirements because it is driving the largest current volume` : null,
    topHcpcsEntry ? `audit ${topHcpcsEntry[0]} orders for diagnosis linkage, physician documentation, and intake completeness` : null,
    historicalSummary?.topCodes?.length
      ? `compare live reimbursement against the historical baseline led by ${historicalSummary.topCodes[0]?.hcpcs || "top HCPCS"}`
      : null,
    revenueCollected > 0 ? `use ${formatMoney(revenueCollected)} collected as the baseline when prioritizing high-yield follow-up` : null,
  ].filter(Boolean)

  return [
    `Finding: ${findingParts.join("; ")}.`,
    `Risk: ${riskParts.join("; ") || "live data is thin, so recommendations should be treated as directional only"}.`,
    `Recommended action: ${actionParts.join("; ") || "refresh the snapshot and re-run after more live order activity is available"}.`,
  ].join(" ")
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions).catch(() => null)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rateKey =
    (typeof session.user.email === "string" && session.user.email) ||
    (typeof session.user.name === "string" && session.user.name) ||
    "session"
  if (!allowTridentRateLimit(rateKey)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  let body: { prompt?: unknown; context?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 })
  }

  const context = body.context

  const token = session.user.accessToken

  const [ordersData, kpisData, patientsData] = await Promise.all([
    fetchCore("/orders?limit=200", token),
    fetchCore("/analytics/kpis?days=90", token),
    fetchCore("/patients?limit=200", token),
  ])

  const orders = ordersData?.orders || []
  const patients = patientsData?.patients || []
  const livePaidTotal = orders.reduce(
    (sum: number, o: Record<string, unknown>) =>
      sum + (Number.parseFloat(String(o.paid_amount ?? o.total_paid ?? 0)) || 0),
    0,
  )
  const hasLiveReimbursement = livePaidTotal > 0
  const historicalSummary = hasLiveReimbursement ? null : await fetchHistoricalHcpcsSummary()

  const text = buildInternalTridentResponse({
    prompt,
    orders,
    patients,
    kpisData,
    historicalSummary,
    context,
  })

  return NextResponse.json({ response: text })
}
