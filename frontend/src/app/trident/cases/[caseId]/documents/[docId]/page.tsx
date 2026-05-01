import Link from "next/link"
import { notFound } from "next/navigation"

import { getTridentCaseDetail } from "@/lib/trident-engine"

export const dynamic = "force-dynamic"

export default async function TridentSourceDocumentPage({
  params,
}: {
  params: Promise<{ caseId: string; docId: string }>
}) {
  const { caseId, docId } = await params
  const tridentCase = await getTridentCaseDetail(caseId)
  const doc = tridentCase?.source_documents.find((item) => item.id === docId)
  if (!tridentCase || !doc) notFound()

  const fileUrl = `/api/lite/patients/${caseId}/documents/${docId}/file`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{doc.category}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{doc.filename}</h1>
          <p className="mt-2 text-sm text-slate-600">Case {caseId}</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Open Raw PDF
          </a>
          <Link
            href={`/trident/cases/${caseId}`}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Back to case
          </Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-300 bg-white shadow-sm">
        <iframe src={fileUrl} title={doc.filename} className="h-[80vh] w-full bg-slate-100" />
      </section>
    </div>
  )
}
