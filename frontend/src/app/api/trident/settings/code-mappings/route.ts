import { NextResponse } from "next/server"

import { getCodeMappings, setCodeMappings, type CodeMapping } from "@/lib/trident-settings"

export async function GET() {
  return NextResponse.json({ code_mappings: getCodeMappings() })
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null) as { code_mappings?: CodeMapping[] } | null
  if (!body?.code_mappings) {
    return NextResponse.json({ error: "InvalidBody", message: "code_mappings is required" }, { status: 400 })
  }
  return NextResponse.json({ code_mappings: setCodeMappings(body.code_mappings) })
}
