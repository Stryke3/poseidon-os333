import { liteServerFetch } from "@/lib/lite-api"

export type Trident30OrderRow = {
  id: string
  queue_bucket: string
  patient: Record<string, unknown>
  workflow: Record<string, unknown>
}

export async function listTrident30Queue(bucket?: "green" | "yellow" | "red"): Promise<Trident30OrderRow[]> {
  const qs = bucket ? `?bucket=${encodeURIComponent(bucket)}` : ""
  const r = await liteServerFetch(`/api/v1/orders/queue${qs}`)
  if (!r.ok) return []
  const j = (await r.json()) as { orders?: Trident30OrderRow[] }
  return j.orders || []
}
