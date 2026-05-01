import { NextResponse } from "next/server"

import { getTridentCaseDetail } from "@/lib/trident-engine"
import { getLiteBaseUrl, liteAuthHeaders } from "@/lib/lite-api"
import { toSpearBoardCase } from "@/lib/spear-board"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params
  const tridentCase = await getTridentCaseDetail(caseId)
  if (!tridentCase) {
    return NextResponse.json({ error: "NotFound", message: "Case not found" }, { status: 404 })
  }
  return NextResponse.json(toSpearBoardCase(tridentCase))
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params
  const res = await fetch(`${getLiteBaseUrl()}/patients/${caseId}`, {
    method: "DELETE",
    headers: liteAuthHeaders(),
    cache: "no-store",
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
