import Link from "next/link"

import { listTridentGeneratedDocs } from "@/lib/trident-engine"

export const dynamic = "force-dynamic"

export default async function TridentGeneratedDocsPage() {
  const docs = await listTridentGeneratedDocs()
  const visibleDocs = docs.filter((doc) => doc.type === "SWO" || doc.type.toLowerCase().includes("addendum"))

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/8 bg-[#15111b] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.2)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#d9eb74]/74">Activity</p>
        <h2 className="mt-3 text-3xl tracking-[-0.05em] text-[#f5f1e8]">Generated document activity</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Only active outputs are surfaced here: SWO and payer addendum packages. No claims, billing, fax, or delivery-document UI is exposed.
        </p>
      </section>

      <div className="grid gap-4">
        {visibleDocs.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-14 text-center text-sm text-slate-500">
            No SWO or payer addendum documents generated yet.
          </div>
        ) : (
          visibleDocs.map((doc) => (
            <div key={doc.id} className="rounded-[28px] border border-white/8 bg-[#efe8da] p-5 text-[#17141a] shadow-[0_16px_36px_rgba(0,0,0,0.08)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">{doc.type}</p>
                  <h3 className="mt-2 text-xl font-semibold">{doc.id}</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    Case {doc.case_id} · template {doc.template_version} · {doc.created_at || "timestamp unavailable"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/trident/cases/${doc.case_id}`}
                    className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-black/20 hover:text-[#17141a]"
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
