import { NextResponse } from "next/server"

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params
  return NextResponse.json(
    {
      error: "NotImplemented",
      message: `Field-level canonical case patching is not wired yet for case ${caseId}. Use the case review form while the Trident data model is being finalized.`,
    },
    { status: 501 },
  )
}
