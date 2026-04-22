import { notFound } from "next/navigation"

import { PatientLiteRepository } from "@/components/lite/PatientLiteRepository"
import { Trident30OrderWorkspace } from "@/components/trident/Trident30OrderWorkspace"
import { getTridentCaseDetail } from "@/lib/trident-engine"

export const dynamic = "force-dynamic"

const bannerTone = {
  READY_TO_GENERATE: "border-emerald-300 bg-emerald-50 text-emerald-800",
  DRAFT_NOT_READY: "border-amber-300 bg-amber-50 text-amber-800",
  BLOCKED: "border-red-300 bg-red-50 text-red-800",
} as const

export default async function TridentCaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>
}) {
  const { caseId } = await params
  const tridentCase = await getTridentCaseDetail(caseId)
  if (!tridentCase) notFound()

  return (
    <div className="space-y-6">
      <section className={`rounded-3xl border px-5 py-4 ${bannerTone[tridentCase.status]}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em]">Case Review</p>
            <h2 className="mt-1 text-2xl font-semibold">
              {tridentCase.patient_first_name} {tridentCase.patient_last_name}
            </h2>
            <p className="mt-1 text-sm">
              {tridentCase.procedure_name || "Procedure not confidently extracted"} · Laterality {tridentCase.laterality}
            </p>
          </div>
          <div className="rounded-full border border-current/20 px-4 py-2 text-sm font-semibold">
            {tridentCase.status.replaceAll("_", " ")}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-300 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Rule Hits</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {tridentCase.rule_hits.map((hit) => (
              <li key={`${hit.rule_name}-${hit.message}`} className="rounded-2xl border border-slate-200 px-3 py-2">
                <span className="font-semibold">{hit.rule_name}</span>: {hit.message}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border border-slate-300 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Extraction Traceability</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {tridentCase.extracted_fields.slice(0, 8).map((field) => (
              <li key={field.field_name} className="rounded-2xl border border-slate-200 px-3 py-2">
                <span className="font-semibold">{field.field_name}</span>: {field.field_value || "missing"} · confidence{" "}
                {Math.round(field.confidence * 100)}%
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PatientLiteRepository
        patient={{
          id: tridentCase.id,
          first_name: tridentCase.patient_first_name,
          last_name: tridentCase.patient_last_name,
          dob: tridentCase.dob,
          phone: tridentCase.phone,
          email: null,
          address: tridentCase.address_1,
          payer_name: tridentCase.primary_insurance,
          member_id: tridentCase.member_id_primary,
          ordering_provider: tridentCase.provider_name,
          diagnosis_codes: tridentCase.diagnosis_codes,
          hcpcs_codes: [],
          notes: tridentCase.review_flags.join("\n"),
          created_at: null,
          updated_at: null,
        }}
        uploads={tridentCase.source_documents}
        generated={tridentCase.generated_documents.map((doc) => ({
          id: doc.id,
          document_type: doc.type === "ADDENDUM" ? "addendum" : doc.type.toLowerCase(),
          created_at: doc.created_at,
        }))}
        basePath="/trident/cases"
        productLabel="SUPER TRIDENT"
      />

      <Trident30OrderWorkspace orderId={tridentCase.id} />
    </div>
  )
}
