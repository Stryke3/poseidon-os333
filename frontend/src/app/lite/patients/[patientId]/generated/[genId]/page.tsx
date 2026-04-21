import Link from "next/link"
import { notFound } from "next/navigation"

import { liteServerFetch } from "@/lib/lite-api"

export const dynamic = "force-dynamic"

export default async function GeneratedDocPage({
  params,
}: {
  params: Promise<{ patientId: string; genId: string }>
}) {
  const { patientId, genId } = await params
  const res = await liteServerFetch(`/patients/${patientId}/generated/${genId}`)
  if (!res.ok) notFound()
  const doc = await res.json()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">Generated document</p>
          <h1 className="text-xl font-semibold capitalize">{doc.document_type}</h1>
          <p className="text-xs text-slate-400">{doc.created_at}</p>
        </div>
        <div className="flex gap-3">
          <Link href={`/lite/patients/${patientId}`} className="text-sm text-slate-600 hover:text-slate-900">
            ← Patient repository
          </Link>
          <a
            href={`/api/lite/patients/${patientId}/generated/${genId}/file`}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-800"
          >
            Download .txt
          </a>
        </div>
      </div>
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 font-mono text-sm text-slate-800 shadow-sm">
        {doc.content || ""}
      </pre>
    </div>
  )
}
