import { NextResponse } from "next/server"

import { getTridentCaseDetail } from "@/lib/trident-engine"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params
  const tridentCase = await getTridentCaseDetail(caseId)
  if (!tridentCase) {
    return NextResponse.json({ error: "NotFound", message: "Case not found" }, { status: 404 })
  }
  return NextResponse.json({
    case: {
      id: tridentCase.id,
      status: tridentCase.status,
      review_flags: tridentCase.review_flags,
      extracted_fields: tridentCase.extracted_fields,
      rule_hits: tridentCase.rule_hits,
      source_documents: tridentCase.source_documents,
      generated_documents: tridentCase.generated_documents,
    },
  })
}
