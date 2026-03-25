/**
 * EDI service client-side helpers.
 * All calls go through /api/edi (Next.js proxy) which forwards to poseidon_edi:8006.
 */

export interface EdiHealthResponse {
  status: string
  service: string
  version: string
  dry_run: boolean
  submission_method: string
  database: string
  availity_sftp: string
  stedi: string
}

export interface SftpMailboxFile {
  filename: string
  size: number
  modified: string | null
  is_dir: boolean
}

export interface SftpMailboxResponse {
  host: string
  files: SftpMailboxFile[]
}

export interface SftpPollResult {
  files_processed?: number
  files_found?: number
  results?: Array<{
    filename: string
    status: string
    claims?: number
    paid?: number
    denials?: number
    error?: string
  }>
  files?: Array<{ filename: string; size: number }>
  message?: string
}

export interface ClaimSubmission {
  id: string
  order_id: string
  org_id: string
  claim_number: string
  status: string
  interchange_control_number: string
  stedi_transaction_id?: string
  failure_reason?: string
  batch_id?: string
  submission_count: number
  submitted_at?: string
  acknowledged_at?: string
  created_at: string
}

export interface RemittanceBatch {
  id: string
  org_id: string
  filename?: string
  source: string
  payer_name?: string
  check_number?: string
  check_date?: string
  total_paid: number
  status: string
  claim_count: number
  received_at: string
  parsed_at?: string
  posted_at?: string
}

export interface DenialItem {
  id: string
  patient_control_number: string
  order_id?: string
  billed_amount: number
  paid_amount: number
  patient_responsibility: number
  patient_last_name?: string
  patient_first_name?: string
  service_date_start?: string
  payer_name?: string
  check_date?: string
  carc_code?: string
  rarc_code?: string
  denial_category?: string
  suggested_action?: string
  adjustment_amount?: number
  is_actionable?: boolean
  adjustment_group?: string
}

export interface RemittanceStats {
  period_days: number
  summary: {
    batch_count: number
    total_claims: number
    total_billed: number
    total_paid: number
    total_denials: number
    total_partial: number
    denial_rate: number
    collection_rate: number
  }
  top_denial_codes: Array<{
    carc_code: string
    denial_category: string
    count: number
    total_amount: number
  }>
  by_payer: Array<{
    payer_name: string
    claims: number
    billed: number
    paid: number
    denials: number
  }>
}

async function ediGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ path, ...params })
  const res = await fetch(`/api/edi?${qs.toString()}`, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `EDI request failed (${res.status})`)
  return data as T
}

async function ediPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch("/api/edi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `EDI request failed (${res.status})`)
  return data as T
}

export async function getEdiHealth(): Promise<EdiHealthResponse> {
  return ediGet("/health")
}

export async function getRemittanceStats(days = 30): Promise<RemittanceStats> {
  return ediGet("/api/v1/remittance/stats", { days: String(days) })
}

export async function getDenialWorklist(limit = 50): Promise<{
  total: number
  denials: DenialItem[]
  by_category: Record<string, { count: number; total_amount: number }>
}> {
  return ediGet("/api/v1/remittance/denials", { limit: String(limit) })
}

export async function getClaimSubmissions(limit = 50): Promise<{
  total: number
  submissions: ClaimSubmission[]
}> {
  return ediGet("/api/v1/claims/submissions", { limit: String(limit) })
}

export async function getRemittanceBatches(limit = 25): Promise<{
  total: number
  batches: RemittanceBatch[]
}> {
  return ediGet("/api/v1/remittance/batches", { limit: String(limit) })
}

export async function submitClaim(orderId: string): Promise<{
  status: string
  submission_id?: string
  icn?: string
  message?: string
  errors?: string[]
}> {
  return ediPost(`/api/v1/claims/submit/${orderId}`)
}

export async function validateClaim(orderId: string): Promise<{
  valid: boolean
  errors?: string[]
  claim_number?: string
  total_charge?: string
  service_lines?: number
  diagnosis_codes?: number
  payer?: string
}> {
  return ediPost(`/api/v1/claims/validate/${orderId}`)
}

export async function autoPostBatch(batchId: string): Promise<{
  batch_id: string
  posted: number
  skipped: number
  errors: Array<{ claim_id: string; error: string }>
}> {
  return ediPost(`/api/v1/remittance/batch/${batchId}/post`)
}

// --- SFTP Mailbox ---

export async function getSftpMailbox(): Promise<SftpMailboxResponse> {
  return ediGet("/api/v1/sftp/mailbox")
}

export async function pollSftp835s(): Promise<SftpPollResult> {
  return ediPost("/api/v1/sftp/poll-835")
}

export async function pollSftpAcks(): Promise<SftpPollResult> {
  return ediPost("/api/v1/sftp/poll-acks")
}
