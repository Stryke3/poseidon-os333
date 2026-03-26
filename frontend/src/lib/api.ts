/**
 * Dashboard API helpers.
 *
 * Kanban and KPIs are loaded from Core via server components (`getLiveDashboardData`).
 * The Python Trident service (`services/trident`) exposes ML endpoints under `/api/v1/trident/*`
 * (score, forecast, etc.) — not `/v1/worklist/kanban`. Do not call those from the browser with secrets.
 *
 * `queryTrident` uses the Next.js route `/api/trident`, which enriches prompts with a Core snapshot
 * and calls Anthropic when `ANTHROPIC_API_KEY` is set (assistant / “chat Trident”, not the ML service).
 */

export async function moveKanbanCard(
  cardId: string,
  fromCol: string,
  toCol: string,
  orderIds: string[] = [],
) {
  const toStatusMap: Record<string, string> = {
    intake: "intake",
    eligibility_verification: "eligibility_check",
    prior_auth: "pending_auth",
    documentation: "documents_pending",
    claim_submitted: "submitted",
    pending_payment: "pending_payment",
    denied: "denied",
    appealed: "appealed",
    paid: "paid",
  }
  const nextStatus = toStatusMap[toCol]
  if (!nextStatus) throw new Error(`Unsupported target stage: ${toCol}`)

  const ids = orderIds.length ? orderIds : [cardId]
  for (const orderId of ids) {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, fromCol }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error((data as { error?: string; detail?: string }).error || (data as { detail?: string }).detail || "Move blocked.")
    }
  }

  return { success: true }
}

export async function fetchPatientNotes(patientId: string) {
  const res = await fetch(`/api/patients/${patientId}/notes`, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to load notes.")
  return (data as { notes: Array<{ id: string; author_name: string; content: string; created_at: string }> }).notes || []
}

export async function addPatientNote(patientId: string, content: string) {
  const res = await fetch(`/api/patients/${patientId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to save note.")
  return data
}

export async function assignPatientRep(patientId: string, repId: string) {
  const res = await fetch(`/api/patients/${patientId}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rep_id: repId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to assign rep.")
  return data as { patient_id: string; rep_id: string; orders_updated: number; assignee_display: string }
}

export async function fetchReps() {
  const res = await fetch("/api/users/reps", { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to load reps.")
  return (data as { users: Array<{ id: string; email: string; first_name: string; last_name: string; role: string; display: string }> }).users || []
}

export async function queryTrident(
  prompt: string,
  context?: {
    accounts?: Array<{ name: string; payer: string; type: string; value: string }>
    pipeline?: Record<string, number>
  },
) {
  const res = await fetch("/api/trident", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, context }),
  })

  const data = (await res.json().catch(() => ({}))) as { response?: string; error?: string }
  if (!res.ok) {
    throw new Error(data.error || `Trident request failed (${res.status})`)
  }

  return data
}
