import type { SpearCase, StoredArtifact } from "@/lib/poseidon-store"
import type { VerifiedDestination } from "@/lib/trident/authorization"

const BASE = "https://fax.api.sinch.com/v3"
function environment() { return { projectId: process.env.SINCH_PROJECT_ID?.trim() || "", keyId: process.env.SINCH_KEY_ID?.trim() || "", keySecret: process.env.SINCH_KEY_SECRET?.trim() || "", from: process.env.SINCH_FROM_NUMBER?.trim() || "", callbackSecret: process.env.SINCH_WEBHOOK_SECRET?.trim() || "", callbackBase: (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "") } }
function auth(key: string, secret: string) { return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` }
function number(raw: string) { const digits = raw.replace(/\D/g, ""); if (digits.length === 10) return `+1${digits}`; if (digits.length === 11 && digits[0] === "1") return `+${digits}`; if (raw[0] === "+" && digits.length >= 11) return `+${digits}`; throw new Error("Verified fax destination is invalid.") }

export function faxProviderHealth() {
  const env = environment()
  const missing = [["SINCH_PROJECT_ID",env.projectId],["SINCH_KEY_ID",env.keyId],["SINCH_KEY_SECRET",env.keySecret]].filter(([,item]) => !item).map(([name]) => name)
  return { provider: "sinch" as const, configured: !missing.length, missing, callback_configured: Boolean(env.callbackBase && env.callbackSecret) }
}

export async function sendAuthorizationFax(input: { caseRecord: SpearCase; packet: StoredArtifact; destination: VerifiedDestination; idempotencyKey: string }) {
  const health = faxProviderHealth(); if (!health.configured) throw new Error(`Sinch fax transport is not configured. Missing: ${health.missing.join(", ")}`)
  if (input.destination.channel !== "fax") throw new Error(`The verified ${input.destination.channel} route requires manual/portal completion; fax was not attempted.`)
  if (!input.packet.content_base64) throw new Error("The exact certified packet bytes are unavailable; fax was not attempted.")
  const env = environment(); const body = new FormData(); const destination = number(input.destination.destination)
  body.append("to", destination); if (env.from) body.append("from", number(env.from))
  body.append("headerText", `StrykeFox Medical | ${input.packet.metadata.procedural_title || "Authorization Request"} | ${input.caseRecord.patient_name}`)
  if (health.callback_configured) { body.append("callbackUrl", `${env.callbackBase}/api/fax/inbound`); body.append("callbackUrlContentType", "application/json") }
  body.append("file", new Blob([new Uint8Array(Buffer.from(input.packet.content_base64,"base64"))], { type: "application/pdf" }), input.packet.filename)
  const response = await fetch(`${BASE}/projects/${env.projectId}/faxes`, { method: "POST", headers: { Authorization: auth(env.keyId,env.keySecret), "Idempotency-Key": input.idempotencyKey }, body, cache: "no-store" })
  const raw = await response.json().catch(() => ({})) as Record<string,unknown>
  if (!response.ok) throw new Error(`Sinch rejected the fax (${response.status}): ${String(raw.message || raw.error || "No detail")}`)
  const provider_id = String(raw.id || raw.faxId || ""); if (!provider_id) throw new Error("Sinch returned no provider fax ID; success was not recorded.")
  return { provider: "sinch" as const, provider_id, provider_status: String(raw.status || "QUEUED"), destination, accepted_at: new Date().toISOString(), raw }
}

export async function pollAuthorizationFax(providerId: string) {
  const health = faxProviderHealth(); if (!health.configured) throw new Error(`Sinch fax transport is not configured. Missing: ${health.missing.join(", ")}`)
  const env = environment(); const response = await fetch(`${BASE}/projects/${env.projectId}/faxes/${encodeURIComponent(providerId)}`, { headers: { Authorization: auth(env.keyId,env.keySecret) }, cache: "no-store" })
  const raw = await response.json().catch(() => ({})) as Record<string,unknown>; if (!response.ok) throw new Error(`Sinch status lookup failed (${response.status}).`)
  const status = String(raw.status || "UNKNOWN").toUpperCase(); const failure = String(raw.errorCode || raw.failureReason || raw.error || "")
  return { provider: "sinch" as const, provider_id: providerId, status, delivered: ["COMPLETED","DELIVERED","SUCCESS"].includes(status) && !failure, failed: ["FAILED","CANCELED","CANCELLED","ERROR"].includes(status) || Boolean(failure), failure_reason: failure || null, pages: Number(raw.numberOfPages || raw.pages || 0) || null, completed_at: String(raw.completedTime || raw.completedAt || "") || null, receipt_reference: String(raw.reference || raw.resultCode || "") || null, checked_at: new Date().toISOString(), raw }
}
