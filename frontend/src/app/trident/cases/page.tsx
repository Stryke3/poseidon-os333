import Link from "next/link"

import { CreatePatientForm } from "@/components/lite/CreatePatientForm"
import { listTridentCases } from "@/lib/trident-engine"
import { listTrident30Queue } from "@/lib/trident30-api"

export const dynamic = "force-dynamic"

const statusTone = {
  READY_TO_GENERATE: "border-emerald-300 bg-emerald-50 text-emerald-800",
  DRAFT_NOT_READY: "border-amber-300 bg-amber-50 text-amber-800",
  BLOCKED: "border-red-300 bg-red-50 text-red-800",
} as const

export default async function TridentCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; v3?: string; bucket?: "green" | "yellow" | "red" }>
}) {
  const { q, v3, bucket } = await searchParams
  const cases = await listTridentCases(q)
  const v3bucket = v3 && bucket && ["green", "yellow", "red"].includes(bucket) ? bucket : undefined
  const v3orders = v3 && v3bucket ? await listTrident30Queue(v3bucket) : v3 && !v3bucket ? await listTrident30Queue() : null

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-300 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">Intake Queue</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Surgical document factory queue</h2>
            <p className="mt-3 text-sm text-slate-600">
              Upload patient packets, review extracted facts, and generate only the SWO plus payer addendum set.
            </p>
          </div>
          <CreatePatientForm basePath="/trident/cases" buttonLabel="Create Case" />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-300 bg-white p-4 shadow-sm">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-center" action="/trident/cases" method="get">
          <input
            name="q"
            defaultValue={q || ""}
            placeholder="Search patient, payer, provider, or case ID"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <button className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white" type="submit">
            Search
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-300 bg-slate-50/80 p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">TRIDENT 3.0 packet queue</p>
        <p className="mt-1 text-sm text-slate-600">Green = packet-ready, Yellow = in progress, Red = blocked.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/trident/cases?v3=1"
            className={`rounded-full border px-3 py-1 text-sm ${v3 && !v3bucket ? "border-slate-900 bg-white" : "border-slate-200 bg-white hover:bg-slate-50"}`}
          >
            All
          </Link>
          {(["green", "yellow", "red"] as const).map((b) => (
            <Link
              key={b}
              href={`/trident/cases?v3=1&bucket=${b}`}
              className={`rounded-full border px-3 py-1 text-sm capitalize ${
                v3bucket === b ? "border-slate-900 bg-white" : "border-slate-200 bg-white hover:bg-slate-50"
              } ${b === "green" ? "text-emerald-800" : b === "red" ? "text-red-800" : "text-amber-800"}`}
            >
              {b}
            </Link>
          ))}
        </div>
        {v3orders && (
          <ul className="mt-4 space-y-2">
            {v3orders.length === 0 ? (
              <li className="text-sm text-slate-500">No orders in this view.</li>
            ) : (
              v3orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/trident/cases/${o.id}`} className="text-slate-900 hover:underline">
                    {String((o.patient as { first_name?: string })?.first_name || "")}{" "}
                    {String((o.patient as { last_name?: string })?.last_name || "")}
                  </Link>{" "}
                  <span className="text-xs text-slate-500">· {o.queue_bucket}</span>
                </li>
              ))
            )}
          </ul>
        )}
        {!v3 && (
          <p className="mt-2 text-xs text-slate-500">Use the links above to list TRIDENT 3.0 state from the API.</p>
        )}
      </section>

      <section className="grid gap-4">
        {cases.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-sm text-slate-500">
            No cases found. Upload a packet to start OCR review.
          </div>
        ) : (
          cases.map((tridentCase) => (
            <Link
              key={tridentCase.id}
              href={`/trident/cases/${tridentCase.id}`}
              className="rounded-3xl border border-slate-300 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-slate-900">
                      {tridentCase.patient_first_name} {tridentCase.patient_last_name}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone[tridentCase.status]}`}
                    >
                      {tridentCase.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    {tridentCase.primary_insurance || "Payer missing"} · {tridentCase.provider_name || "Provider missing"} · DOB{" "}
                    {tridentCase.dob || "missing"}
                  </p>
                  <p className="text-sm text-slate-500">
                    Procedure family: {tridentCase.procedure_family} · Laterality: {tridentCase.laterality}
                  </p>
                </div>
                <div className="min-w-[280px] space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Review flags</p>
                  {tridentCase.review_flags.length === 0 ? (
                    <p className="text-sm text-emerald-700">No blocking review flags.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-slate-700">
                      {tridentCase.review_flags.slice(0, 3).map((flag) => (
                        <li key={flag}>• {flag}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </section>
    </div>
  )
}
