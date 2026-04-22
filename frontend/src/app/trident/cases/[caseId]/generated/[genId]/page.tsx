import Link from "next/link"
import { notFound } from "next/navigation"

import { getTridentCaseDetail } from "@/lib/trident-engine"

export const dynamic = "force-dynamic"

export default async function TridentGeneratedDocPage({
  params,
}: {
  params: Promise<{ caseId: string; genId: string }>
}) {
  const { caseId, genId } = await params
  const tridentCase = await getTridentCaseDetail(caseId)
  const doc = tridentCase?.generated_documents.find((item) => item.id === genId)
  if (!tridentCase || !doc) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{doc.type}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Generated document preview</h1>
          <p className="mt-2 text-sm text-slate-600">
            Case {caseId} · template {doc.template_version} · {doc.created_at || "timestamp unavailable"}
          </p>
        </div>
        <Link
          href={`/trident/cases/${caseId}`}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Back to case
        </Link>
      </div>

      <section className="rounded-3xl border border-slate-300 bg-white p-6 shadow-sm">
        <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{doc.rendered_html}</pre>
      </section>
    </div>
  )
}
