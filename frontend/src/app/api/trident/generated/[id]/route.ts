import { NextRequest, NextResponse } from "next/server"

import { getTridentCaseDetail } from "@/lib/trident-engine"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const caseId = req.nextUrl.searchParams.get("caseId")
  if (!caseId) {
    return NextResponse.json(
      { error: "MissingCaseId", message: "Provide ?caseId=... to resolve a generated document." },
      { status: 400 },
    )
  }
  const tridentCase = await getTridentCaseDetail(caseId)
  const doc = tridentCase?.generated_documents.find((item) => item.id === id)
  if (!doc) {
    return NextResponse.json({ error: "NotFound", message: "Generated document not found" }, { status: 404 })
  }
  return NextResponse.json(doc)
}
