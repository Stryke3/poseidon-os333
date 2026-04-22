import { NextResponse } from "next/server"

import { getTemplates, setTemplates, type TemplateDefinition } from "@/lib/trident-settings"

export async function GET() {
  return NextResponse.json({ templates: getTemplates() })
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null) as { templates?: TemplateDefinition[] } | null
  if (!body?.templates) {
    return NextResponse.json({ error: "InvalidBody", message: "templates is required" }, { status: 400 })
  }
  return NextResponse.json({ templates: setTemplates(body.templates) })
}
