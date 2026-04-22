import { NextRequest, NextResponse } from "next/server"

import { liteServerFetch } from "@/lib/lite-api"

export const runtime = "nodejs"

/** Proxy to Poseidon Lite TRIDENT 3.0 API (`/api/v1/...` on the Lite service). */
async function proxy(req: NextRequest, segments: string[]) {
  const sub = segments.length ? segments.map((s) => encodeURIComponent(s)).join("/") : ""
  const u = new URL(req.url)
  const path = sub ? `/api/v1/${sub}${u.search}` : `/api/v1${u.search}`
  const headers: Record<string, string> = {}
  const ct = req.headers.get("content-type")
  if (ct) headers["Content-Type"] = ct
  const init: RequestInit = { method: req.method, headers, cache: "no-store" }
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer()
  }
  return liteServerFetch(path, init)
}

function toNext(res: Response): Promise<NextResponse> {
  return res.text().then((text) => {
    const h = new Headers()
    const ct = res.headers.get("content-type")
    if (ct) h.set("content-type", ct)
    return new NextResponse(text, { status: res.status, headers: h })
  })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segs = [] } = await ctx.params
  return toNext(await proxy(req, segs))
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segs = [] } = await ctx.params
  return toNext(await proxy(req, segs))
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segs = [] } = await ctx.params
  return toNext(await proxy(req, segs))
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segs = [] } = await ctx.params
  return toNext(await proxy(req, segs))
}
