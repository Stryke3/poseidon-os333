import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"

import { authOptions } from "@/lib/auth"
import {
  HeroPanel,
  PageShell,
  SectionCard,
  SectionHeading,
} from "@/components/dashboard/DashboardPrimitives"
import { PodDeliveryGuidancePanel, type PodDeliveryGuidancePayload } from "@/components/patient/PodDeliveryGuidancePanel"

const CORE_API_URL =
  process.env.POSEIDON_API_URL || process.env.CORE_API_URL || "http://poseidon_core:8001"

type ChartDocument = {
  id?: string
  doc_type?: string
  file_name?: string
  status?: string
  download_url?: string
}

type OrderBundle = {
  id: string
  status?: string
  priority?: string
  payer_id?: string
  hcpcs_codes?: string[]
  billing_status?: string
  swo_status?: string
  tracking_number?: string
  tracking_status?: string
  documents?: ChartDocument[]
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

type PatientChartPayload = {
  patient: {
    id: string
    first_name?: string
    last_name?: string
    dob?: string
    email?: string
    phone?: string
    insurance_id?: string
    payer_id?: string
    diagnosis_codes?: string[]
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
  payments: FinancialItem[]
  denials: FinancialItem[]
  appeals: FinancialItem[]
  eobs: FinancialItem[]
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

function DocumentLink({ label, document }: { label: string; document?: ChartDocument | null }) {
  if (!document?.id) {
    return <span className="text-slate-500">{label}: Not attached</span>
  }
  if (!document.download_url) {
    return <span className="text-slate-300">{label}: {document.file_name || document.id}</span>
  }
  return (
    <a
      className="text-accent-blue transition hover:text-white"
      href={document.download_url}
      rel="noreferrer"
      target="_blank"
    >
      {label}: {document.file_name || document.id}
    </a>
  )
}

export default async function PatientFilePage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) redirect("/login")

  const res = await fetch(`${CORE_API_URL}/patients/${patientId}/chart`, {
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })

  if (!res.ok) {
    redirect("/intake")
  }

  const chart = (await res.json()) as PatientChartPayload
  const patient = chart.patient
  const patientName =
    [patient.first_name, patient.last_name].filter(Boolean).join(" ") || "Unknown Patient"

  return (
    <PageShell contentClassName="max-w-7xl">
      <HeroPanel
        eyebrow="Patient Lifecycle"
        title={patientName}
        description={[
          patient.email || "No email on file",
          patient.insurance_id || "No insurance ID",
          patient.payer_id || "No payer",
          patient.dob || "No DOB",
        ].join(" · ")}
        actions={
          <>
            <Link
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:border-accent-blue"
              href="/intake"
            >
              Back To Intake
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.82fr)]">
        <div className="space-y-6">
          <SectionCard>
            <SectionHeading
              eyebrow="Orders"
              title="Integrated Patient Chart"
              description="Every order, signature packet, tracking artifact, and billing status attached to this patient."
            />
            <div className="grid gap-4">
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
                        HCPCS: {(order.hcpcs_codes || []).join(", ") || "None"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        SWO: {order.swo_status || "not started"} · Tracking: {order.tracking_status || order.tracking_number || "not attached"}
                      </p>
                    </div>
                    <div className="grid gap-1 text-xs lg:text-right">
                      <DocumentLink label="SWO copy" document={order.primary_documents?.swo} />
                      <DocumentLink label="CMS-1500" document={order.primary_documents?.cms1500} />
                      <DocumentLink label="POD" document={order.primary_documents?.pod} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {chart.pod_delivery_guidance ? (
            <SectionCard>
              <SectionHeading
                eyebrow="Compliance"
                title="POD & CMS delivery checklist"
                description="Same operational content as the generated POD package PDF—use for intake, delivery, and billing prep."
              />
              <PodDeliveryGuidancePanel data={chart.pod_delivery_guidance} />
            </SectionCard>
          ) : null}

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

        <SectionCard className="h-fit">
          <SectionHeading
            eyebrow="Profile"
            title="Patient Snapshot"
            description="Demographics and chart-level reimbursement posture."
          />
          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Patient ID</p>
              <p className="mt-2 break-all text-sm text-white">{patient.id}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Diagnosis Codes</p>
              <p className="mt-2 text-sm text-white">{(patient.diagnosis_codes || []).join(", ") || "Not available"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Payments Recorded</p>
              <p className="mt-2 text-sm text-white">{chart.summary.payments_count}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">EOBs Attached</p>
              <p className="mt-2 text-sm text-white">{chart.summary.eobs_count}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Denied Amount</p>
              <p className="mt-2 text-sm text-white">{formatCurrency(chart.summary.denied_amount_total)}</p>
            </div>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  )
}
