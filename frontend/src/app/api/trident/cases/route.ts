import { NextRequest, NextResponse } from "next/server"

import { listTridentCases } from "@/lib/trident-engine"

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || undefined
  const cases = await listTridentCases(q)
  return NextResponse.json({ cases })
}
