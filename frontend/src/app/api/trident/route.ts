import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

const CORE_API_URL =
  process.env.POSEIDON_API_URL || process.env.CORE_API_URL || "http://poseidon_core:8001"

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

  const apiKey = process.env.ANTHROPIC_API_KEY || ""

  if (!apiKey) {
    return NextResponse.json({
      response:
        "Trident analysis unavailable. Configure ANTHROPIC_API_KEY in the environment to enable live intelligence.",
    })
  }

  const token = session.user.accessToken
  let liveContext = ""

  const [ordersData, kpisData, patientsData] = await Promise.all([
    fetchCore("/orders?limit=200", token),
    fetchCore("/analytics/kpis?days=90", token),
    fetchCore("/patients?limit=200", token),
  ])

  const orders = ordersData?.orders || []
  const patients = patientsData?.patients || []

  if (ordersData === null && kpisData === null && patientsData === null) {
    liveContext =
      "WARNING: Could not reach Core API or requests failed. No live snapshot available."
  } else {
    const byStatus: Record<
      string,
      { count: number; totalBilled: number; totalPaid: number; totalDenied: number; items: string[] }
    > = {}
    for (const o of orders) {
      const s = o.status || "unknown"
      if (!byStatus[s])
        byStatus[s] = { count: 0, totalBilled: 0, totalPaid: 0, totalDenied: 0, items: [] }
      byStatus[s].count++
      byStatus[s].totalBilled += parseFloat(o.total_billed || 0)
      byStatus[s].totalPaid += parseFloat(o.paid_amount || o.total_paid || 0)
      byStatus[s].totalDenied += parseFloat(o.denied_amount || 0)
      if (byStatus[s].items.length < 10) {
        const hcpcs = Array.isArray(o.hcpcs_codes) ? o.hcpcs_codes.join(",") : o.hcpcs_codes || ""
        byStatus[s].items.push(
          `  ${o.patient_name || "Unknown"} | ${o.payer_name || o.payer_id || "unknown"} | HCPCS:${hcpcs} | billed:$${o.total_billed || 0} | paid:${o.paid_amount || o.total_paid || 0} | denied:${o.denied_amount || 0}`,
        )
      }
    }

    const orderSummary = Object.entries(byStatus)
      .map(([status, data]) => {
        const header = `${status.toUpperCase()} (${data.count} orders, billed:$${data.totalBilled.toFixed(0)}, paid:$${data.totalPaid.toFixed(0)}, denied:$${data.totalDenied.toFixed(0)})`
        return `${header}\n${data.items.join("\n")}${data.count > 10 ? `\n  ... and ${data.count - 10} more` : ""}`
      })
      .join("\n\n")

    const byPayer: Record<string, { count: number; billed: number; paid: number }> = {}
    for (const o of orders) {
      const payer = o.payer_name || o.payer_id || "unknown"
      if (!byPayer[payer]) byPayer[payer] = { count: 0, billed: 0, paid: 0 }
      byPayer[payer].count++
      byPayer[payer].billed += parseFloat(o.total_billed || 0)
      byPayer[payer].paid += parseFloat(o.paid_amount || o.total_paid || 0)
    }
    const payerSummary = Object.entries(byPayer)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([payer, d]) => `  ${payer}: ${d.count} orders, billed:$${d.billed.toFixed(0)}, paid:$${d.paid.toFixed(0)}`)
      .join("\n")

    const byHcpcs: Record<string, { count: number; billed: number; paid: number }> = {}
    for (const o of orders) {
      const codes = Array.isArray(o.hcpcs_codes) ? o.hcpcs_codes : [o.hcpcs_codes || "unknown"]
      for (const code of codes) {
        if (!byHcpcs[code]) byHcpcs[code] = { count: 0, billed: 0, paid: 0 }
        byHcpcs[code].count++
        byHcpcs[code].billed += parseFloat(o.total_billed || 0)
        byHcpcs[code].paid += parseFloat(o.paid_amount || o.total_paid || 0)
      }
    }
    const hcpcsSummary = Object.entries(byHcpcs)
      .sort((a, b) => b[1].count - a[1].count)
      .map(
        ([code, d]) =>
          `  ${code}: ${d.count} orders, billed:$${d.billed.toFixed(0)}, paid:$${d.paid.toFixed(0)}, avg reimbursement:$${d.count > 0 ? (d.paid / d.count).toFixed(0) : 0}`,
      )
      .join("\n")

    const patientSummary = patients
      .slice(0, 30)
      .map(
        (p: Record<string, string>) =>
          `  ${p.first_name || ""} ${p.last_name || ""} | ${p.id} | ${p.primary_payer || "unknown"}`,
      )
      .join("\n")

    const kpiBlock = kpisData
      ? `KPIs (last 90 days):
- Total orders: ${kpisData.orders?.total || 0}
- Denied: ${kpisData.orders?.denied || 0} (${kpisData.orders?.denial_rate_pct || "N/A"})
- Revenue collected: $${kpisData.revenue?.collected?.toFixed(0) || 0}
- Revenue denied: $${kpisData.revenue?.denied?.toFixed(0) || 0}
- Denial breakdown: ${JSON.stringify(kpisData.denial_breakdown || [])}
- Top CARC codes: ${JSON.stringify(kpisData.top_carc_codes || [])}`
      : "KPIs: unavailable"

    liveContext = `POSEIDON CORE SNAPSHOT (${new Date().toISOString()}) — point-in-time API data, may be incomplete:

${kpiBlock}

ORDERS BY STATUS:
${orderSummary}

ORDERS BY PAYER:
${payerSummary}

ORDERS BY HCPCS CODE:
${hcpcsSummary}

PATIENTS (${patients.length} total, showing first 30):
${patientSummary}

Total orders in snapshot: ${orders.length}`
  }

  if (context && typeof context === "object") {
    liveContext += `\n\nADDITIONAL CONTEXT FROM DASHBOARD UI:\n${JSON.stringify(context)}`
  }

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: `You are Trident, the assistant for Poseidon OS at StrykeFox Medical.
You receive a structured snapshot from the Poseidon Core API (not direct database access). Use only what appears in the snapshot; if data is missing, say so.
Respond with clinical precision. Lead with the key finding. Be specific about dollar amounts, percentages, and action items when the snapshot supports it.
Format: finding → risk → recommended action. Keep responses under 200 words.

${liveContext}`,
      messages: [{ role: "user", content: prompt }],
    }),
  })

  const anthropicJson = await anthropicRes.json().catch(() => null)

  if (!anthropicRes.ok) {
    const msg =
      (anthropicJson as { error?: { message?: string } })?.error?.message ||
      (anthropicJson as { error?: string })?.error ||
      `Anthropic request failed (${anthropicRes.status})`
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const text =
    (anthropicJson as { content?: Array<{ text?: string }> })?.content?.[0]?.text ||
    "Trident analysis unavailable."

  return NextResponse.json({ response: text })
}
