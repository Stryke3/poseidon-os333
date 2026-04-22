import { NextResponse } from "next/server"

import { getLiteBaseUrl, liteAuthHeaders } from "@/lib/lite-api"

const kindMap = {
  SWO: "swo",
  ADDENDUM: "transmittal",
} as const

export async function POST(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params
  const body = await req.json().catch(() => ({})) as { doc_types?: Array<keyof typeof kindMap> }
  const kinds = body.doc_types?.length ? body.doc_types : ["SWO", "ADDENDUM"]

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

  return NextResponse.json({ case_id: caseId, results })
}
