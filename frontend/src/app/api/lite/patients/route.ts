import { NextResponse } from "next/server"

import { getLiteBaseUrl, liteAuthHeaders } from "@/lib/lite-api"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")
  const path = q ? `/patients?q=${encodeURIComponent(q)}` : "/patients"
  const res = await fetch(`${getLiteBaseUrl()}${path}`, {
    headers: liteAuthHeaders(),
    cache: "no-store",
  })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}

export async function POST(req: Request) {
  const body = await req.text()
  const res = await fetch(`${getLiteBaseUrl()}/patients`, {
    method: "POST",
    headers: { ...liteAuthHeaders(), "Content-Type": "application/json" },
    body,
    cache: "no-store",
  })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
