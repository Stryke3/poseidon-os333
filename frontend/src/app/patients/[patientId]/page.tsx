import Link from "next/link"
import { redirect } from "next/navigation"

import { getSafeServerSession } from "@/lib/auth"
import {
  HeroPanel,
  PageShell,
  SectionCard,
  SectionHeading,
} from "@/components/dashboard/DashboardPrimitives"
import ClaimActions from "@/components/patient/ClaimActions"
import { ChartAddDevice } from "@/components/patient/ChartAddDevice"
import { DocumentManager, type DocSlot } from "@/components/patient/DocumentManager"
import PatientDangerZone from "@/components/patient/PatientDangerZone"
import { formatHcpcsList, getHcpcsShortDescription } from "@/lib/hcpcs"
import { getServiceBaseUrl } from "@/lib/runtime-config"

type ChartDocument = {
  id?: string
  doc_type?: string
  file_name?: string
  status?: string
  download_url?: string
}

type OrderDiagnosisRow = {
  icd10_code?: string
  description?: string | null
  is_primary?: boolean
  sequence?: number
}

type OrderCatalogue = {
  label: string
  vertical?: string | null
  product_category?: string | null
  source_channel?: string | null
  source?: string | null
  source_reference?: string | null
}

type BillingLineItemRow = {
  hcpcs_code?: string
  modifier?: string | null
  description?: string | null
  quantity?: number
  billed_amount?: number | string | null
  allowed_amount?: number | string | null
  expected_reimbursement?: number | null
  learned_rate?: {
    median_paid?: number | null
    avg_paid?: number | null
    denial_rate?: number | null
    sample_count?: number
  } | null
  _synthetic?: boolean
}

type PredictiveModelingRow = {
  next_action?: string
  protocol_type?: string
  status?: string
  status_code?: string
  predicted_payment_date?: string | null
  predicted_payment_window_days?: number
  estimated_collection_probability?: number
  days_in_stage?: number
  denial_risk_score?: number | null
  risk_tier?: string | null
  trident_flags?: unknown
  notes?: string[]
}

type OrderLineItemRow = {
  id?: string
  order_id?: string
  hcpcs_code?: string
  modifier?: string | null
  description?: string | null
  quantity?: number
}

type OrderBundle = {
  id: string
  status?: string
  priority?: string
  payer_id?: string
  payer_name?: string
  hcpcs_codes?: string[]
  billing_status?: string
  swo_status?: string
  tracking_number?: string
  tracking_status?: string
  total_billed?: number | string
  total_allowed?: number | string
  total_paid?: number | string
  paid_amount?: number | string
  denied_amount?: number | string
  documents?: ChartDocument[]
  diagnoses?: OrderDiagnosisRow[]
  /** HCPCS line items from Core (chart devices source when top-level devices[] is absent). */
  line_items?: OrderLineItemRow[]
  billing_line_items?: BillingLineItemRow[]
  catalogue?: OrderCatalogue
  predictive_modeling?: PredictiveModelingRow
  primary_documents?: {
    swo?: ChartDocument | null
    cms1500?: ChartDocument | null
    pod?: ChartDocument | null
  }
  created_at?: string
  updated_at?: string
}

type FinancialItem = {
  id?: string
  order_id?: string
  paid_amount?: number | string
  denied_amount?: number | string
  denial_category?: string
  denial_reason?: string
  status?: string
  appeal_status?: string
  claim_number?: string
  payer_claim_number?: string
  eob_reference?: string
  total_paid?: number | string
  total_billed?: number | string
  claim_status?: string
  date_of_service?: string
  payment_date?: string
  denial_date?: string
  created_at?: string
}

type PatientFaxEntry = {
  id?: string
  direction?: string
  fax_number?: string
  facility?: string | null
  patient_name?: string | null
  patient_dob?: string | null
  patient_mrn?: string | null
  patient_id?: string | null
  order_id?: string | null
  related_fax_id?: string | null
  review_status?: string | null
  review_reason?: string | null
  status?: string | null
  pages?: number
  service?: string | null
  file_url?: string | null
  received_at?: string | null
  created_at?: string
}

type ChartNoteRow = {
  id?: string
  content?: string
  author_name?: string | null
  created_at?: string
}

type ChartDeviceRow = {
  id?: string
  order_id?: string
  hcpcs_code?: string
  modifier?: string | null
  description?: string | null
  quantity?: number
}

type PatientChartPayload = {
  patient: {
    id: string
    first_name?: string
    last_name?: string
    dob?: string
    email?: string
    phone?: string
    address?: string | { line1?: string | null; line2?: string | null; city?: string; state?: string; zip?: string } | null
    insurance_id?: string
    payer_id?: string
    diagnosis_codes?: string[]
    next_of_kin?: string
    drivers_license_download_url?: string
    primary_insurance?: { payer_name?: string; member_id?: string; card_front_url?: string; card_back_url?: string } | null
    secondary_insurance?: { payer_name?: string; member_id?: string; card_front_url?: string; card_back_url?: string } | null
  }
  summary: {
    total_orders: number
    signed_swo_count: number
    payments_count: number
    denials_count: number
    appeals_count: number
    eobs_count: number
    paid_amount_total: number
    denied_amount_total: number
  }
  orders: OrderBundle[]
  devices?: ChartDeviceRow[]
  notes?: ChartNoteRow[]
  payments: FinancialItem[]
  denials: FinancialItem[]
  appeals: FinancialItem[]
  eobs: FinancialItem[]
  faxes?: PatientFaxEntry[]
}

function formatCurrency(value: number | string | undefined) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value || "")
  if (!Number.isFinite(numeric)) return "Pending"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(numeric)
}

function formatDate(value?: string) {
  if (!value) return "Pending"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString()
}

function parseAmount(value: number | string | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number.parseFloat(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function faxReviewTone(status?: string | null) {
  switch (status) {
    case "pending_chart_review":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100"
    case "pending_patient_match":
      return "border-orange-500/30 bg-orange-500/10 text-orange-100"
    case "unmatched":
      return "border-red-500/30 bg-red-500/10 text-red-100"
    default:
      return "border-white/10 bg-white/5 text-slate-200"
  }
}

function faxReviewLabel(status?: string | null) {
  switch (status) {
    case "pending_chart_review":
      return "Review before filing"
    case "pending_patient_match":
      return "Link or create patient"
    case "unmatched":
      return "Unmatched return fax"
    case "linked_to_chart":
      return "Linked to chart"
    case "reviewed":
      return "Reviewed"
    default:
      return "Logged"
  }
}

function sumLedgerPaid(orderId: string, payments: FinancialItem[]) {
  return payments
    .filter((p) => p.order_id === orderId)
    .reduce((s, p) => s + parseAmount(p.paid_amount), 0)
}

function sumLedgerDenied(orderId: string, denials: FinancialItem[]) {
  return denials
    .filter((d) => d.order_id === orderId)
    .reduce((s, d) => s + parseAmount(d.denied_amount), 0)
}

/** Derive primary device label from all orders' HCPCS codes */
function deriveDeviceLabel(orders: OrderBundle[]) {
  const allCodes = orders.flatMap((o) => o.hcpcs_codes || [])
  if (!allCodes.length) return null
  const unique = Array.from(new Set(allCodes))
  return unique.map((c) => getHcpcsShortDescription(c)).join(", ")
}

/** Build document slots for the DocumentManager from an order bundle */
function buildDocSlots(order: OrderBundle): DocSlot[] {
  const pd = order.primary_documents || {}
  return [
    { key: "swo", label: "SWO / Detailed Written Order", required: true, document: pd.swo },
    { key: "cms1500", label: "CMS-1500 Claim Form", required: true, document: pd.cms1500 },
    { key: "pod", label: "Proof of Delivery (POD)", required: true, document: pd.pod },
    { key: "patient_id", label: "Patient ID / Driver's License", required: true, document: findDoc(order.documents, "patient_id") },
    { key: "doctors_notes", label: "Doctor's Notes", required: false, document: findDoc(order.documents, "doctors_notes") },
    { key: "addendum", label: "Addendum for Device", required: false, document: findDoc(order.documents, "addendum") },
  ]
}

function findDoc(docs: ChartDocument[] | undefined, docType: string): ChartDocument | null {
  if (!docs) return null
  return docs.find((d) => d.doc_type === docType) || null
}

/** Older Core builds omit chart-level notes/devices; derive devices from order line_items. */
function normalizePatientChartPayload(chart: PatientChartPayload): PatientChartPayload {
  const notes = chart.notes ?? []
  const existing = chart.devices
  if (Array.isArray(existing) && existing.length > 0) {
    return { ...chart, notes, devices: existing }
  }
  const devices: ChartDeviceRow[] = []
  for (const o of chart.orders || []) {
    const items = o.line_items
    if (!items?.length) continue
    for (const li of items) {
      if (!li || typeof li !== "object") continue
      devices.push({
        ...li,
        order_id: li.order_id ?? o.id,
      })
    }
  }
  return { ...chart, notes, devices }
}

function formatProbability(p: number | undefined) {
  if (p === undefined || Number.isNaN(p)) return "—"
  return `${Math.round(p * 100)}%`
}

export default async function PatientFilePage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const coreApiUrl = getServiceBaseUrl("POSEIDON_API_URL")
  const { patientId } = await params
  const session = await getSafeServerSession()
  if (!session?.user?.accessToken) redirect("/login")

  const res = await fetch(`${coreApiUrl}/patients/${patientId}/chart`, {
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => null)
    const errorMessage = errorData?.detail || errorData?.error || "Patient not found"
    return (
      <PageShell contentClassName="max-w-[1820px]">
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-8 py-6">
            <p className="text-lg font-semibold text-red-400">Unable to load patient chart</p>
            <p className="mt-2 text-sm text-slate-400">{errorMessage}</p>
            <p className="mt-1 text-xs text-slate-500">Patient ID: {patientId}</p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-accent-blue/30 px-4 py-2 text-sm text-accent-blue transition hover:border-accent-blue hover:text-white"
          >
            Back to Dashboard
          </Link>
        </div>
      </PageShell>
    )
  }

  const chart = normalizePatientChartPayload((await res.json()) as PatientChartPayload)
  const patient = chart.patient
  const patientName =
    [patient.first_name, patient.last_name].filter(Boolean).join(" ") || "Unknown Patient"

  const deviceLabel = deriveDeviceLabel(chart.orders)
  const faxEntries = chart.faxes || []
  const pendingFaxes = faxEntries.filter((fax) =>
    ["pending_chart_review", "pending_patient_match", "unmatched"].includes(fax.review_status || ""),
  )

  return (
    <PageShell contentClassName="max-w-[1820px]">
	      <HeroPanel
        eyebrow="Patient Lifecycle"
        title={patientName}
        description={
          <>
            {deviceLabel && (
              <span className="mr-3 inline-block rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 py-1 text-sm font-bold uppercase tracking-wide text-accent-blue">
                {deviceLabel}
              </span>
            )}
            <span>
              {[
                patient.email || "No email on file",
                patient.insurance_id || "No insurance ID",
                patient.payer_id || "No payer",
                patient.dob ? `DOB: ${formatDate(patient.dob)}` : "No DOB",
              ].join(" \u00b7 ")}
            </span>
          </>
        }
        actions={
          <>
            <Link
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:border-accent-blue"
              href="/"
            >
              Live OS
            </Link>
            <Link
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:border-accent-blue"
              href="/edi"
            >
              EDI / Claims
            </Link>
            <Link
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:border-accent-blue"
              href="/executive"
            >
              Executive View
            </Link>
          </>
        }
        aside={
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-accent-blue">Orders</p>
              <p className="mt-2 text-2xl font-semibold text-white">{chart.summary.total_orders}</p>
            </div>
            <div className="rounded-2xl border border-accent-green/20 bg-accent-green/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-accent-green">Paid</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(chart.summary.paid_amount_total)}</p>
            </div>
            <div className="rounded-2xl border border-accent-gold/20 bg-accent-gold/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-accent-gold-2">Signed SWOs</p>
              <p className="mt-2 text-2xl font-semibold text-white">{chart.summary.signed_swo_count}</p>
            </div>
            <div className="rounded-2xl border border-accent-red/20 bg-accent-red/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-accent-red">Denials / Appeals</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {chart.summary.denials_count} / {chart.summary.appeals_count}
              </p>
            </div>
          </div>
        }
	        className="mb-6"
	      />

        <div className="mb-6">
          <PatientDangerZone patientId={patientId} patientName={patientName} />
        </div>

	      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(420px,1fr)]">
        <div className="space-y-6">
          {/* ── Orders ── */}
          <SectionCard>
            <SectionHeading
              eyebrow="Orders"
              title="Integrated Patient Chart"
              description="Every order, signature packet, tracking artifact, and billing status attached to this patient."
            />
            <div className="mb-6">
              <ChartAddDevice patientId={patientId} orders={chart.orders.map((o) => ({ id: o.id }))} />
            </div>
            <div className="grid gap-4">
              {chart.orders.length === 0 && (
                <p className="text-sm text-slate-500">No orders found for this patient.</p>
              )}
              {chart.orders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Order {order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Status: {order.status || "unknown"} · Priority: {order.priority || "standard"} · Billing: {order.billing_status || "pending"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Payer: {order.payer_name || order.payer_id || "—"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Device: {formatHcpcsList(order.hcpcs_codes)}
                      </p>
                      {order.catalogue ? (
                        <div className="mt-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs text-slate-200">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">Catalogue &amp; sourcing</p>
                          <p className="mt-1 font-medium text-white">{order.catalogue.label}</p>
                        </div>
                      ) : null}
                      {order.diagnoses && order.diagnoses.length > 0 ? (
                        <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Coding (ICD-10)</p>
                          <ul className="mt-1.5 list-inside list-disc space-y-0.5">
                            {[...order.diagnoses]
                              .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
                              .map((dx) => (
                                <li key={`${order.id}-${dx.icd10_code}-${dx.sequence}`}>
                                  <span className="font-mono text-slate-200">{dx.icd10_code}</span>
                                  {dx.description ? <span className="text-slate-500"> — {dx.description}</span> : null}
                                  {dx.is_primary ? (
                                    <span className="ml-1 rounded bg-amber-500/20 px-1 text-[10px] text-amber-200">primary</span>
                                  ) : null}
                                </li>
                              ))}
                          </ul>
                        </div>
                      ) : null}
                      {order.billing_line_items && order.billing_line_items.length > 0 ? (
                        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
                          <table className="w-full min-w-[520px] border-collapse text-left text-[11px] text-slate-300">
                            <thead>
                              <tr className="border-b border-white/10 bg-white/[0.04] text-[10px] uppercase tracking-wider text-slate-500">
                                <th className="px-3 py-2">Line / HCPCS</th>
                                <th className="px-3 py-2">Mod</th>
                                <th className="px-3 py-2 text-right">Qty</th>
                                <th className="px-3 py-2 text-right">Billed</th>
                                <th className="px-3 py-2 text-right">Allowed</th>
                                <th className="px-3 py-2 text-right">Expected reimbursement</th>
                                <th className="px-3 py-2">Model</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.billing_line_items.map((row, idx) => (
                                <tr key={`${order.id}-li-${idx}`} className="border-b border-white/5">
                                  <td className="px-3 py-2">
                                    <span className="font-mono text-white">{row.hcpcs_code || "—"}</span>
                                    {row.description ? (
                                      <span className="mt-0.5 block text-slate-500">{row.description}</span>
                                    ) : (
                                      <span className="mt-0.5 block text-slate-600">
                                        {row.hcpcs_code ? getHcpcsShortDescription(row.hcpcs_code) : null}
                                      </span>
                                    )}
                                    {row._synthetic ? (
                                      <span className="ml-1 text-[9px] text-slate-600">(from order HCPCS)</span>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-slate-400">{row.modifier || "—"}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{row.quantity ?? 1}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(parseAmount(row.billed_amount))}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(parseAmount(row.allowed_amount))}</td>
                                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-200">
                                    {row.expected_reimbursement != null && Number.isFinite(row.expected_reimbursement)
                                      ? formatCurrency(row.expected_reimbursement)
                                      : "Pending"}
                                  </td>
                                  <td className="px-3 py-2 text-slate-500">
                                    {row.learned_rate && row.learned_rate.sample_count ? (
                                      <span>
                                        n={row.learned_rate.sample_count}
                                        {row.learned_rate.denial_rate != null
                                          ? ` · den ${formatProbability(row.learned_rate.denial_rate)}`
                                          : ""}
                                      </span>
                                    ) : (
                                      <span className="text-slate-600">No payer/HCPCS history</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                      {order.predictive_modeling ? (
                        <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-3 text-xs text-slate-200">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-violet-300">Predictive modeling</p>
                          <p className="mt-2 text-sm font-medium text-white">{order.predictive_modeling.next_action}</p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                            <span>
                              Protocol:{" "}
                              <span className="text-slate-200">{order.predictive_modeling.protocol_type || "—"}</span>
                            </span>
                            <span>
                              Stage:{" "}
                              <span className="text-slate-200">
                                {order.predictive_modeling.status_code || order.predictive_modeling.status || "—"}
                              </span>
                            </span>
                            <span>
                              Days in stage:{" "}
                              <span className="text-slate-200">{order.predictive_modeling.days_in_stage ?? "—"}</span>
                            </span>
                            <span>
                              Predicted pay:{" "}
                              <span className="text-slate-200">
                                {order.predictive_modeling.predicted_payment_date
                                  ? formatDate(order.predictive_modeling.predicted_payment_date)
                                  : "—"}{" "}
                                (
                                {order.predictive_modeling.predicted_payment_window_days != null
                                  ? `${order.predictive_modeling.predicted_payment_window_days}d window`
                                  : "—"}
                                )
                              </span>
                            </span>
                            <span>
                              Est. collection:{" "}
                              <span className="text-slate-200">
                                {formatProbability(order.predictive_modeling.estimated_collection_probability)}
                              </span>
                            </span>
                            {order.predictive_modeling.denial_risk_score != null ? (
                              <span>
                                Denial risk (Trident):{" "}
                                <span className="text-slate-200">{order.predictive_modeling.denial_risk_score}</span>
                              </span>
                            ) : null}
                            {order.predictive_modeling.risk_tier ? (
                              <span>
                                Risk tier: <span className="text-slate-200">{order.predictive_modeling.risk_tier}</span>
                              </span>
                            ) : null}
                          </div>
                          {order.predictive_modeling.notes && order.predictive_modeling.notes.length > 0 ? (
                            <ul className="mt-2 list-inside list-disc text-[11px] text-slate-500">
                              {order.predictive_modeling.notes.map((n) => (
                                <li key={n}>{n}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-400">
                        SWO: {order.swo_status || "not started"} · Tracking: {order.tracking_status || order.tracking_number || "not attached"}
                      </p>
                      <ClaimActions orderId={order.id} orderStatus={order.status} billingStatus={order.billing_status} />
                      <div className="mt-3 rounded-xl border border-accent-green/20 bg-[rgba(15,168,106,0.06)] px-3 py-2 text-xs text-slate-300">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-accent-green">LVCO / remittance (this order)</p>
                        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            <span className="text-slate-500">Reimbursed</span>{" "}
                            <span className="font-semibold text-white">
                              {formatCurrency(
                                parseAmount(order.paid_amount) ||
                                  parseAmount(order.total_paid) ||
                                  sumLedgerPaid(order.id, chart.payments),
                              )}
                            </span>
                          </span>
                          <span>
                            <span className="text-slate-500">Denied</span>{" "}
                            <span className="font-semibold text-accent-red">
                              {formatCurrency(
                                parseAmount(order.denied_amount) || sumLedgerDenied(order.id, chart.denials),
                              )}
                            </span>
                          </span>
                          <span>
                            <span className="text-slate-500">Billed</span>{" "}
                            <span className="font-semibold text-slate-200">
                              {formatCurrency(parseAmount(order.total_billed))}
                            </span>
                          </span>
                          <span>
                            <span className="text-slate-500">Allowed</span>{" "}
                            <span className="font-semibold text-slate-200">
                              {formatCurrency(parseAmount(order.total_allowed))}
                            </span>
                          </span>
                          <span className="text-slate-400">
                            Billing: {order.billing_status || "\u2014"} · Order status: {order.status || "\u2014"}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard>
            <SectionHeading
              eyebrow="Fax Returns"
              title="Inbound Fax Review Queue"
              description="Return faxes automatically link back to this chart when we can infer the patient context. Review each one before filing."
            />
            {pendingFaxes.length ? (
              <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {pendingFaxes.length} inbound fax{pendingFaxes.length === 1 ? "" : "es"} need review before being treated as chart-ready documents.
              </div>
            ) : null}
            <div className="grid gap-3">
              {faxEntries.length ? faxEntries.map((fax) => (
                <div
                  key={fax.id}
                  className={`rounded-2xl border p-4 ${faxReviewTone(fax.review_status)}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {fax.direction === "inbound" ? "Inbound fax" : "Outbound fax"} · {fax.fax_number || "Unknown number"}
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        {fax.facility || "Unspecified facility"}
                        {fax.pages ? ` · ${fax.pages} page(s)` : ""}
                        {fax.service ? ` · ${fax.service}` : ""}
                      </p>
                      {fax.review_reason ? (
                        <p className="mt-2 text-xs text-slate-200">{fax.review_reason}</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <span className="inline-block rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
                        {faxReviewLabel(fax.review_status)}
                      </span>
                      <p className="mt-2 text-xs text-slate-400">
                        {formatDate(fax.received_at || fax.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs">
                    {fax.file_url ? (
                      <a
                        href={fax.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-accent-blue transition hover:text-white"
                      >
                        Open received fax
                      </a>
                    ) : null}
                    <Link
                      href="/fax"
                      className="font-semibold text-slate-300 transition hover:text-white"
                    >
                      Review in Fax Center
                    </Link>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-slate-500">No fax history is attached to this patient chart yet.</p>
              )}
            </div>
          </SectionCard>

          {(chart.notes && chart.notes.length > 0) || (chart.devices && chart.devices.length > 0) ? (
            <SectionCard>
              <SectionHeading
                eyebrow="Chart"
                title="Notes &amp; devices"
                description="Patient contact notes and line-item devices (HCPCS) linked to orders."
              />
              {chart.notes && chart.notes.length > 0 ? (
                <div className="mb-6 space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Notes</p>
                  {chart.notes.map((n) => (
                    <div key={n.id} className="rounded-xl border border-white/10 bg-black/10 p-3 text-sm text-slate-200">
                      <p className="text-xs text-slate-500">
                        {n.author_name || "Staff"} · {formatDate(n.created_at)}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap">{n.content}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {chart.devices && chart.devices.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Devices / line items</p>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {chart.devices.map((d) => (
                      <li key={`${d.order_id}-${d.id}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                        <span className="font-mono text-white">{d.hcpcs_code || "—"}</span>
                        {d.description ? <span className="ml-2 text-slate-400">{d.description}</span> : null}
                        <span className="ml-2 text-xs text-slate-500">
                          Order {d.order_id?.slice(0, 8).toUpperCase()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {/* ── Document Management per Order ── */}
          {chart.orders.map((order) => (
            <SectionCard key={`docs-${order.id}`}>
              <SectionHeading
                eyebrow="Compliance Documents"
                title={`Order ${order.id.slice(0, 8).toUpperCase()} — Document Vault`}
                description="Upload, scan, or attach SWO, POD, CMS-1500, and supporting documents. Each document is stored to the patient chart."
              />
              <DocumentManager
                patientId={patientId}
                orderId={order.id}
                slots={buildDocSlots(order)}
              />
            </SectionCard>
          ))}

          {/* ── Revenue Lifecycle ── */}
          <SectionCard>
            <SectionHeading
              eyebrow="Revenue Lifecycle"
              title="Payments, Denials, Appeals, And EOBs"
              description="Financial events tied back to the patient chart."
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-accent-green">Payments</p>
                <div className="mt-3 grid gap-3">
                  {chart.payments.length ? chart.payments.map((payment) => (
                    <div key={payment.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                      <p className="font-semibold text-white">{formatCurrency(payment.paid_amount)}</p>
                      <p>Order {payment.order_id?.slice(0, 8).toUpperCase() || "Unknown"} · {formatDate(payment.payment_date || payment.created_at)}</p>
                      <p>EOB Ref: {payment.eob_reference || "Not attached"}</p>
                    </div>
                  )) : <p className="text-sm text-slate-500">No payments recorded yet.</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-accent-red">Denials</p>
                <div className="mt-3 grid gap-3">
                  {chart.denials.length ? chart.denials.map((denial) => (
                    <div key={denial.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                      <p className="font-semibold text-white">{denial.denial_category || denial.denial_reason || "Denial"}</p>
                      <p>{formatCurrency(denial.denied_amount)} · {formatDate(denial.denial_date || denial.created_at)}</p>
                      <p>Claim: {denial.payer_claim_number || denial.claim_number || "Not attached"}</p>
                    </div>
                  )) : <p className="text-sm text-slate-500">No denials recorded yet.</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-accent-purple">Appeals</p>
                <div className="mt-3 grid gap-3">
                  {chart.appeals.length ? chart.appeals.map((appeal) => (
                    <div key={appeal.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                      <p className="font-semibold text-white">Appeal {appeal.id?.slice(0, 8).toUpperCase()}</p>
                      <p>Status: {appeal.status || appeal.appeal_status || "pending"}</p>
                      <p>Created: {formatDate(appeal.created_at)}</p>
                    </div>
                  )) : <p className="text-sm text-slate-500">No appeals recorded yet.</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-accent-blue">EOBs</p>
                <div className="mt-3 grid gap-3">
                  {chart.eobs.length ? chart.eobs.map((eob) => (
                    <div key={eob.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                      <p className="font-semibold text-white">Claim {eob.claim_number || eob.id?.slice(0, 8).toUpperCase()}</p>
                      <p>Status: {eob.claim_status || "unknown"} · Paid: {formatCurrency(eob.total_paid)}</p>
                      <p>DOS: {formatDate(eob.date_of_service)}</p>
                    </div>
                  )) : <p className="text-sm text-slate-500">No EOBs associated yet.</p>}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Right Sidebar: Patient Snapshot ── */}
        <SectionCard className="h-fit">
          <SectionHeading
            eyebrow="Profile"
            title="Patient Snapshot"
            description="Demographics and chart-level reimbursement posture."
          />
          <div className="grid gap-3">
            {deviceLabel && (
              <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-accent-blue">Device</p>
                <p className="mt-2 text-lg font-bold text-white">{deviceLabel}</p>
              </div>
            )}
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Patient ID</p>
              <p className="mt-2 break-all text-sm text-white">{patient.id}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Date of Birth</p>
              <p className="mt-2 text-sm text-white">{patient.dob ? formatDate(patient.dob) : "Not on file"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Phone</p>
              <p className="mt-2 text-sm text-white">{patient.phone || "Not on file"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Email</p>
              <p className="mt-2 break-all text-sm text-white">{patient.email || "Not on file"}</p>
            </div>
            {/* Primary Insurance */}
            <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-accent-blue">Primary Insurance</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {patient.primary_insurance?.payer_name || patient.payer_id || "Not assigned"}
              </p>
              <p className="mt-1 break-all text-xs text-slate-400">
                ID: {patient.primary_insurance?.member_id || patient.insurance_id || "Not on file"}
              </p>
              {(patient.primary_insurance?.card_front_url || patient.primary_insurance?.card_back_url) ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {patient.primary_insurance.card_front_url && (
                    <a href={patient.primary_insurance.card_front_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-white/10 transition hover:border-accent-blue/40">
                      <img src={patient.primary_insurance.card_front_url} alt="Primary insurance card front" className="h-auto w-full object-cover" />
                      <p className="bg-black/20 py-1 text-center text-[9px] text-slate-400">Front</p>
                    </a>
                  )}
                  {patient.primary_insurance.card_back_url && (
                    <a href={patient.primary_insurance.card_back_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-white/10 transition hover:border-accent-blue/40">
                      <img src={patient.primary_insurance.card_back_url} alt="Primary insurance card back" className="h-auto w-full object-cover" />
                      <p className="bg-black/20 py-1 text-center text-[9px] text-slate-400">Back</p>
                    </a>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No insurance card scanned</p>
              )}
            </div>

            {/* Secondary Insurance */}
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Secondary Insurance</p>
              {patient.secondary_insurance?.payer_name ? (
                <>
                  <p className="mt-2 text-sm font-semibold text-white">{patient.secondary_insurance.payer_name}</p>
                  <p className="mt-1 break-all text-xs text-slate-400">
                    ID: {patient.secondary_insurance.member_id || "Not on file"}
                  </p>
                  {(patient.secondary_insurance.card_front_url || patient.secondary_insurance.card_back_url) ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {patient.secondary_insurance.card_front_url && (
                        <a href={patient.secondary_insurance.card_front_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-white/10 transition hover:border-accent-blue/40">
                          <img src={patient.secondary_insurance.card_front_url} alt="Secondary insurance card front" className="h-auto w-full object-cover" />
                          <p className="bg-black/20 py-1 text-center text-[9px] text-slate-400">Front</p>
                        </a>
                      )}
                      {patient.secondary_insurance.card_back_url && (
                        <a href={patient.secondary_insurance.card_back_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-white/10 transition hover:border-accent-blue/40">
                          <img src={patient.secondary_insurance.card_back_url} alt="Secondary insurance card back" className="h-auto w-full object-cover" />
                          <p className="bg-black/20 py-1 text-center text-[9px] text-slate-400">Back</p>
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">No insurance card scanned</p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-400">None on file</p>
              )}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Diagnosis Codes</p>
              <p className="mt-2 text-sm text-white">{(patient.diagnosis_codes || []).join(", ") || "Not available"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Address</p>
              <p className="mt-2 text-sm text-white">{typeof patient.address === "string" ? patient.address : patient.address && typeof patient.address === "object" ? [patient.address.line1, patient.address.line2, patient.address.city, patient.address.state, patient.address.zip].filter(Boolean).join(", ") || "Not on file" : "Not on file"}</p>
            </div>

            {/* Live financial summary */}
            <div className="mt-2 rounded-2xl border border-accent-green/20 bg-accent-green/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-accent-green">Total Paid</p>
              <p className="mt-2 text-lg font-bold text-white">{formatCurrency(chart.summary.paid_amount_total)}</p>
            </div>
            <div className="rounded-2xl border border-accent-red/20 bg-accent-red/5 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-accent-red">Total Denied</p>
              <p className="mt-2 text-lg font-bold text-white">{formatCurrency(chart.summary.denied_amount_total)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Payments</p>
                <p className="mt-2 text-lg font-semibold text-white">{chart.summary.payments_count}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">EOBs</p>
                <p className="mt-2 text-lg font-semibold text-white">{chart.summary.eobs_count}</p>
              </div>
            </div>

            {/* Patient ID / Driver's License */}
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Patient ID / Driver&apos;s License</p>
              {patient.drivers_license_download_url ? (
                <a href={`/api/patients/${patientId}/drivers-license`} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-lg border border-white/10 transition hover:border-accent-blue/40">
                  <img src={`/api/patients/${patientId}/drivers-license`} alt="Patient ID" className="h-auto w-full object-cover" />
                </a>
              ) : (
                <p className="mt-2 text-sm text-slate-400">No ID scanned</p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  )
}
