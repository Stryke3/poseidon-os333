import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { searchIcd10 } from "@/lib/intake-reference"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const query = req.nextUrl.searchParams.get("query") || ""
  return NextResponse.json({ items: searchIcd10(query) })
}
