import { ACCOUNTS, KANBAN_DATA, KPI_DATA, PIPELINE_DATA, SYSTEM_STATE } from "./data"

const TRIDENT_BASE = process.env.NEXT_PUBLIC_TRIDENT_API_URL || ""
const IS_LIVE = Boolean(TRIDENT_BASE)

async function tridentFetch(endpoint: string, options?: RequestInit) {
  if (!IS_LIVE) return null

  const res = await fetch(`${TRIDENT_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_TRIDENT_TOKEN || ""}`,
      ...options?.headers,
    },
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Trident API error: ${res.status} ${endpoint}`)
  }

  return res.json()
}

export async function getKPIs() {
  const live = await tridentFetch("/v1/metrics/kpi").catch(() => null)
  return live ?? KPI_DATA
}

export async function getPipeline() {
  const live = await tridentFetch("/v1/claims/pipeline").catch(() => null)
  return live ?? PIPELINE_DATA
}

export async function getKanbanData() {
  const live = await tridentFetch("/v1/worklist/kanban").catch(() => null)
  return live ?? KANBAN_DATA
}

export async function getAccounts() {
  const live = await tridentFetch("/v1/accounts").catch(() => null)
  return live ?? ACCOUNTS
}

export async function getSystemState() {
  const live = await tridentFetch("/v1/system/state").catch(() => null)
  return live ?? SYSTEM_STATE
}

export async function moveKanbanCard(
  cardId: string,
  fromCol: string,
  toCol: string,
  orderIds: string[] = [],
) {
  const res = await fetch("/api/worklist/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, fromCol, toCol, orderIds }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || "Move blocked.")
  }

  if (IS_LIVE) {
    await tridentFetch("/v1/worklist/move", {
      method: "POST",
      body: JSON.stringify({ cardId, fromCol, toCol }),
    }).catch(() => null)
  }

  return data
}

export async function queryTrident(
  prompt: string,
  context?: {
    accounts?: Array<{ name: string; payer: string; type: string; value: string }>
    pipeline?: Record<string, number>
  },
) {
  if (IS_LIVE) {
    const live = await tridentFetch("/v1/trident/query", {
      method: "POST",
      body: JSON.stringify({ prompt, context }),
    }).catch(() => null)

    if (live) return live
  }

  const res = await fetch("/api/trident", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, context }),
  })

  return res.json()
}
