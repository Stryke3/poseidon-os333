import Link from "next/link"

import { listTridentGeneratedDocs } from "@/lib/trident-engine"

export const dynamic = "force-dynamic"

export default async function TridentGeneratedDocsPage() {
  const docs = await listTridentGeneratedDocs()

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">Generated Docs</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">SWO and payer addendum outputs</h2>
      </div>

      <div className="grid gap-4">
        {docs.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-sm text-slate-500">
            No generated SUPER TRIDENT documents yet.
          </div>
        ) : (
          docs.map((doc) => (
            <div key={doc.id} className="rounded-3xl border border-slate-300 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{doc.type}</p>
                  <h3 className="mt-1 text-lg font-semibold">{doc.id}</h3>
                  <p className="text-sm text-slate-600">
                    Case {doc.case_id} · template {doc.template_version} · {doc.created_at || "timestamp unavailable"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/trident/cases/${doc.case_id}`}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    Open case
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
