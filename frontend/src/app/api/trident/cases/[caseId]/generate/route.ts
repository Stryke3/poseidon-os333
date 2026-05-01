import { NextResponse } from "next/server"

import { DEFAULT_TRIDENT_GENERATE_DOC_TYPES } from "@/lib/trident-generate-defaults"
import { getLiteBaseUrl, liteAuthHeaders } from "@/lib/lite-api"

const kindMap = {
  SWO: "swo",
  POD: "pod",
  ADDENDUM: "addendum",
} as const

type RequestedKind = keyof typeof kindMap

export async function POST(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params
  const body = await req.json().catch(() => ({})) as { doc_types?: RequestedKind[] }
  const rawKinds = body.doc_types?.length ? body.doc_types : [...DEFAULT_TRIDENT_GENERATE_DOC_TYPES]
  const kinds = rawKinds.filter((k): k is RequestedKind => k in kindMap)
  if (!kinds.length) {
    return NextResponse.json({ error: "No valid doc_types; use SWO, POD, and/or ADDENDUM" }, { status: 400 })
  }

  const results = await Promise.all(
    kinds.map(async (kind) => {
      const liteKind = kindMap[kind]
      const res = await fetch(`${getLiteBaseUrl()}/patients/${caseId}/generate/${liteKind}`, {
        method: "POST",
        headers: liteAuthHeaders(),
        cache: "no-store",
      })
      const text = await res.text()
      return {
        requested_type: kind,
        status: res.status,
        body: text,
      }
    }),
  )

  const failed = results.filter((result) => result.status >= 400)
  return NextResponse.json(
    { case_id: caseId, results },
    { status: failed.length ? 502 : 200 },
  )
}
