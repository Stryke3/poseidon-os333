import { NextResponse } from "next/server"

import { getLiteBaseUrl, liteAuthHeaders } from "@/lib/lite-api"

type Ctx = { params: Promise<{ patientId: string; docId: string }> }

export async function GET(req: Request, ctx: Ctx) {
  const { patientId, docId } = await ctx.params
  const res = await fetch(`${getLiteBaseUrl()}/patients/${patientId}/documents/${docId}/file`, {
    headers: liteAuthHeaders(),
    cache: "no-store",
  })
  if (!res.ok) {
    const t = await res.text()
    return NextResponse.json({ detail: t }, { status: res.status })
  }
  const ct = res.headers.get("content-type") || "application/octet-stream"
  const filename = res.headers.get("content-disposition")?.match(/filename="?([^"]+)"?/)?.[1] || "document.pdf"
  const disposition = new URL(req.url).searchParams.get("download") === "1" ? "attachment" : "inline"
  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      "Content-Type": ct,
      "Content-Disposition": `${disposition}; filename="${filename}"`,
    },
  })
}
