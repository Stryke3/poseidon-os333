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

/** Aggregated snapshot: template fallback + LLM context (order samples use IDs only—no patient names). */
type TridentDigestSnapshot = {
  dataHealth: "empty" | "historical_only" | "live"
  orderCount: number
  patientCount: number
  statusCounts: Record<string, number>
  deniedOrderCount: number
  intakeOrderCount: number
  pendingAuthOrderCount: number
  totals: { billed: number; paid: number; deniedAmount: number }
  topPayers: Array<{ name: string; count: number }>
  topHcpcs: Array<{ code: string; count: number }>
  denialRatePct: number
  revenueDenied: number
  revenueCollected: number
  kpis: Record<string, unknown> | null
  historicalSummary: HistoricalHcpcsSummary | null
  orderSamples: Array<{
    id: string | null
    status: string | null
    payer: string | null
    hcpcs: string[]
    billed: number | null
    paid: number | null
  }>
  dashboardContextIncluded: boolean
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

function normalizeHcpcsList(order: Record<string, unknown>): string[] {
  const raw = order.hcpcs_codes
  const list = Array.isArray(raw) ? raw : [raw]
  const out: string[] = []
  for (const c of list) {
    const code = String(c || "").trim().toUpperCase()
    if (code) out.push(code)
  }
  return out.length ? out : ["UNKNOWN"]
}

function buildTridentSnapshot(
  orders: Array<Record<string, unknown>>,
  patients: Array<Record<string, unknown>>,
  kpisData: Record<string, unknown> | null,
  historicalSummary: HistoricalHcpcsSummary | null,
  context: unknown,
): TridentDigestSnapshot {
  const statusCounts: Record<string, number> = {}
  let deniedOrderCount = 0
  let intakeOrderCount = 0
  let pendingAuthOrderCount = 0
  const payerCounts = new Map<string, number>()
  const hcpcsCounts = new Map<string, number>()
  let totalBilled = 0
  let totalPaid = 0
  let totalDeniedAmount = 0

  for (const o of orders) {
    const st = String(o.status || "unknown").toLowerCase() || "unknown"
    statusCounts[st] = (statusCounts[st] || 0) + 1
    if (st === "denied") deniedOrderCount += 1
    if (st === "intake") intakeOrderCount += 1
    if (st.includes("auth")) pendingAuthOrderCount += 1

    const payer = String(o.payer_name || o.payer_id || "unknown").trim() || "unknown"
    payerCounts.set(payer, (payerCounts.get(payer) || 0) + 1)
    for (const code of normalizeHcpcsList(o)) {
      hcpcsCounts.set(code, (hcpcsCounts.get(code) || 0) + 1)
    }
    totalBilled += Number.parseFloat(String(o.total_billed ?? 0)) || 0
    totalPaid += Number.parseFloat(String(o.paid_amount ?? o.total_paid ?? 0)) || 0
    totalDeniedAmount += Number.parseFloat(String(o.denied_amount ?? 0)) || 0
  }

  const topPayers = Array.from(payerCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  const topHcpcs = Array.from(hcpcsCounts.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  const denialRate =
    Number.parseFloat(
      String((kpisData as { orders?: { denial_rate_pct?: unknown } })?.orders?.denial_rate_pct ?? ""),
    ) || 0
  const revenueDenied = Number((kpisData as { revenue?: { denied?: number } })?.revenue?.denied || totalDeniedAmount || 0)
  const revenueCollected = Number((kpisData as { revenue?: { collected?: number } })?.revenue?.collected || totalPaid || 0)

  const orderSamples = orders.slice(0, 14).map((o) => ({
    id: o.id != null ? String(o.id) : null,
    status: o.status != null ? String(o.status) : null,
    payer: o.payer_name != null ? String(o.payer_name) : o.payer_id != null ? String(o.payer_id) : null,
    hcpcs: normalizeHcpcsList(o),
    billed: Number.parseFloat(String(o.total_billed ?? "")) || null,
    paid: Number.parseFloat(String(o.paid_amount ?? o.total_paid ?? "")) || null,
  }))

  let dataHealth: TridentDigestSnapshot["dataHealth"] = "live"
  if (!orders.length && !patients.length && !kpisData && !historicalSummary) {
    dataHealth = "empty"
  } else if (!orders.length && !patients.length && historicalSummary?.topCodes?.length) {
    dataHealth = "historical_only"
  }

  return {
    dataHealth,
    orderCount: orders.length,
    patientCount: patients.length,
    statusCounts,
    deniedOrderCount,
    intakeOrderCount,
    pendingAuthOrderCount,
    totals: { billed: totalBilled, paid: totalPaid, deniedAmount: totalDeniedAmount },
    topPayers,
    topHcpcs,
    denialRatePct: denialRate,
    revenueDenied,
    revenueCollected,
    kpis: kpisData,
    historicalSummary,
    orderSamples,
    dashboardContextIncluded: Boolean(context && typeof context === "object"),
  }
}

function buildInternalTridentResponseFromSnapshot(prompt: string, snapshot: TridentDigestSnapshot): string {
  const historicalSummary = snapshot.historicalSummary

  if (snapshot.dataHealth === "empty") {
    return "Finding: live Poseidon data is unavailable right now. Risk: Trident cannot produce a grounded recommendation without a current Core snapshot. Recommended action: verify Core connectivity, then rerun the analysis."
  }

  if (snapshot.dataHealth === "historical_only" && historicalSummary?.topCodes?.length) {
    const top = historicalSummary.topCodes[0]
    return [
      `Finding: Core returned no orders or patients in this snapshot; Trident historical charge-detail baseline has ${historicalSummary.rowCount.toLocaleString()} rows with top HCPCS ${top?.hcpcs} (avg paid ${formatMoney(top?.avgPaid || 0)}).`,
      `Risk: guidance uses historical reimbursement patterns only until live pipeline data is available for your org.`,
      `Recommended action: if you expect live data, verify POSEIDON_API_URL from the dashboard and Core auth; meanwhile prioritize documentation and auth discipline on ${top?.hcpcs} and related high-volume codes from the historical set.`,
    ].join(" ")
  }

  const topPayerEntry = snapshot.topPayers[0]
  const topHcpcsEntry = snapshot.topHcpcs[0]
  const lowerPrompt = prompt.toLowerCase()
  const focusPayer = snapshot.topPayers.find((p) => lowerPrompt.includes(p.name.toLowerCase()))?.name || null
  const focusHcpcs = snapshot.topHcpcs.find((h) => lowerPrompt.includes(h.code.toLowerCase()))?.code || null

  const findingParts = [
    `${snapshot.orderCount} active orders and ${snapshot.patientCount} patients are in the live snapshot`,
    snapshot.denialRatePct > 0
      ? `denial rate is ${snapshot.denialRatePct.toFixed(1)}%`
      : `${snapshot.deniedOrderCount} orders are already sitting in denied status`,
    topPayerEntry ? `${topPayerEntry.name} is the heaviest payer at ${topPayerEntry.count} orders` : null,
    topHcpcsEntry ? `${topHcpcsEntry.code} is the most common HCPCS at ${topHcpcsEntry.count} orders` : null,
  ].filter(Boolean)

  const riskParts = [
    snapshot.deniedOrderCount > 0 ? `${snapshot.deniedOrderCount} denied orders need intervention` : null,
    snapshot.pendingAuthOrderCount > 0 ? `${snapshot.pendingAuthOrderCount} orders are still sitting in prior auth flow` : null,
    snapshot.intakeOrderCount > 0 ? `${snapshot.intakeOrderCount} orders remain at intake and can stall conversion` : null,
    snapshot.revenueDenied > 0 ? `${formatMoney(snapshot.revenueDenied)} is currently marked denied` : null,
    focusPayer ? `the prompt is focused on ${focusPayer}, so payer-specific rules should be reviewed first` : null,
    focusHcpcs ? `${focusHcpcs} appears in the current book and should be checked for documentation quality` : null,
    snapshot.dashboardContextIncluded
      ? "dashboard context was included, so pipeline mix should be considered in prioritization"
      : null,
  ].filter(Boolean)

  const actionParts = [
    snapshot.deniedOrderCount > 0 ? "work the denied queue first and attach the top CARC patterns to each appeal" : null,
    snapshot.pendingAuthOrderCount > 0 ? "clear pending auth orders before they age into preventable denials" : null,
    topPayerEntry
      ? `review ${topPayerEntry.name} documentation requirements because it is driving the largest current volume`
      : null,
    topHcpcsEntry
      ? `audit ${topHcpcsEntry.code} orders for diagnosis linkage, physician documentation, and intake completeness`
      : null,
    historicalSummary?.topCodes?.length
      ? `compare live reimbursement against the historical baseline led by ${historicalSummary.topCodes[0]?.hcpcs || "top HCPCS"}`
      : null,
    snapshot.revenueCollected > 0
      ? `use ${formatMoney(snapshot.revenueCollected)} collected as the baseline when prioritizing high-yield follow-up`
      : null,
  ].filter(Boolean)

  return [
    `Finding: ${findingParts.join("; ")}.`,
    `Risk: ${riskParts.join("; ") || "live data is thin, so recommendations should be treated as directional only"}.`,
    `Recommended action: ${actionParts.join("; ") || "refresh the snapshot and re-run after more live order activity is available"}.`,
  ].join(" ")
}

const LLM_SYSTEM_PROMPT = `You are a senior RCM (revenue cycle) analyst assistant for a DME/biologics order pipeline.

You will receive:
1) A user question.
2) A JSON snapshot of aggregated live orders/patients/KPIs (and sometimes a historical HCPCS baseline from Trident). Order samples use IDs only—do not invent patient names or clinical facts not in the JSON.

Write a clear, digestible answer similar to how ChatGPT or Claude would respond:
- Use short sections with **bold** markdown headings (e.g. **Summary**, **Risks**, **Next steps**).
- Lead with the most important takeaway in 2–3 sentences.
- Use bullet lists where it helps scanability.
- Ground every factual claim in the snapshot; if the data does not support something, say what is missing.
- Keep jargon minimal; explain payer/HCPCS implications briefly when relevant.
- Do not exceed reasonable length (~400–600 words unless the user explicitly asks for depth).`

function snapshotForLLM(s: TridentDigestSnapshot): Record<string, unknown> {
  const hist = s.historicalSummary
    ? {
        sourceAsset: s.historicalSummary.sourceAsset,
        rowCount: s.historicalSummary.rowCount,
        topHcpcsByAvgPaid: s.historicalSummary.topCodes.slice(0, 8).map((t) => ({
          hcpcs: t.hcpcs,
          rowCount: t.count,
          avgPaid: Math.round(t.avgPaid),
          avgBilled: Math.round(t.avgBilled),
        })),
      }
    : null

  const kpisLite =
    s.kpis && typeof s.kpis === "object"
      ? {
          orders: s.kpis.orders,
          revenue: s.kpis.revenue,
          pipeline: s.kpis.pipeline,
        }
      : null

  return {
    dataHealth: s.dataHealth,
    orderCount: s.orderCount,
    patientCount: s.patientCount,
    statusCounts: s.statusCounts,
    deniedOrderCount: s.deniedOrderCount,
    intakeOrderCount: s.intakeOrderCount,
    pendingAuthOrderCount: s.pendingAuthOrderCount,
    totals: {
      billed: Math.round(s.totals.billed),
      paid: Math.round(s.totals.paid),
      deniedAmount: Math.round(s.totals.deniedAmount),
    },
    topPayers: s.topPayers,
    topHcpcs: s.topHcpcs,
    denialRatePct: s.denialRatePct,
    revenueDenied: Math.round(s.revenueDenied),
    revenueCollected: Math.round(s.revenueCollected),
    kpis: kpisLite,
    historicalBaseline: hist,
    orderSamples: s.orderSamples,
    dashboardContextIncluded: s.dashboardContextIncluded,
  }
}

async function openaiDigest(userContent: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return null
  const model = process.env.TRIDENT_DIGEST_OPENAI_MODEL?.trim() || "gpt-4o-mini"
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 1800,
      messages: [
        { role: "system", content: LLM_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  }).catch(() => null)
  if (!res?.ok) return null
  const data = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>
  } | null
  const text = data?.choices?.[0]?.message?.content
  return typeof text === "string" && text.trim() ? text.trim() : null
}

async function anthropicDigest(userContent: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null
  const model = process.env.TRIDENT_DIGEST_ANTHROPIC_MODEL?.trim() || "claude-3-5-haiku-20241022"
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      system: LLM_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  }).catch(() => null)
  if (!res?.ok) return null
  const data = (await res.json().catch(() => null)) as {
    content?: Array<{ type?: string; text?: string }>
  } | null
  const block = data?.content?.find((c) => c.type === "text")
  const text = block?.text
  return typeof text === "string" && text.trim() ? text.trim() : null
}

async function synthesizeDigestWithLLM(prompt: string, snapshot: TridentDigestSnapshot): Promise<{ text: string; provider: string } | null> {
  const disabled = process.env.TRIDENT_DIGEST_LLM?.trim().toLowerCase() === "false"
  if (disabled) return null

  const hasOpenai = Boolean(process.env.OPENAI_API_KEY?.trim())
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  if (!hasOpenai && !hasAnthropic) return null

  const prefer = (process.env.TRIDENT_DIGEST_PROVIDER || "auto").trim().toLowerCase()
  const payload = snapshotForLLM(snapshot)
  const userContent = `User question:\n${prompt}\n\nData snapshot (JSON):\n${JSON.stringify(payload, null, 2)}`

  const runOpenai = () => openaiDigest(userContent)
  const runAnthropic = () => anthropicDigest(userContent)

  if (prefer === "openai") {
    if (hasOpenai) {
      const text = await runOpenai()
      if (text) return { text, provider: "openai" }
    }
    if (hasAnthropic) {
      const text = await runAnthropic()
      if (text) return { text, provider: "anthropic" }
    }
    return null
  }

  if (prefer === "anthropic") {
    if (hasAnthropic) {
      const text = await runAnthropic()
      if (text) return { text, provider: "anthropic" }
    }
    if (hasOpenai) {
      const text = await runOpenai()
      if (text) return { text, provider: "openai" }
    }
    return null
  }

  if (hasOpenai) {
    const text = await runOpenai()
    if (text) return { text, provider: "openai" }
  }
  if (hasAnthropic) {
    const text = await runAnthropic()
    if (text) return { text, provider: "anthropic" }
  }
  return null
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

  const snapshot = buildTridentSnapshot(orders, patients, kpisData, historicalSummary, context)

  const llmResult = await synthesizeDigestWithLLM(prompt, snapshot)
  const template = buildInternalTridentResponseFromSnapshot(prompt, snapshot)

  if (llmResult) {
    return NextResponse.json({
      response: llmResult.text,
      digestSource: `llm-${llmResult.provider}`,
      fallbackTemplate: template,
    })
  }

  return NextResponse.json({
    response: template,
    digestSource: "template",
    digestHint:
      "Set OPENAI_API_KEY or ANTHROPIC_API_KEY on the dashboard service for ChatGPT/Claude-style digests (optional: TRIDENT_DIGEST_PROVIDER=openai|anthropic|auto).",
  })
}
