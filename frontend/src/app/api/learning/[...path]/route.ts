import { NextResponse } from "next/server"
import { availityServiceBaseUrl } from "@/lib/availity-upstream"
import {
  gateAvailityApiRequest,
  takeAvailityGateFailure,
} from "@/lib/availity-api-security"
import { serverFetch } from "@/lib/server-http"

const LEARNING_PREFIX = "/api/learning"

function learningUpstream(pathSegments: string[], search: string): string {
  const base = availityServiceBaseUrl().replace(/\/$/, "")
  const sub = pathSegments.map((s) => encodeURIComponent(s)).join("/")
  return `${base}${LEARNING_PREFIX}/${sub}${search}`
}

async function proxy(req: Request, pathSegments: string[]): Promise<Response> {
  const gate = await gateAvailityApiRequest(req)
  const blocked = takeAvailityGateFailure(gate)
  if (blocked) return blocked

  const url = new URL(req.url)
  const upstream = learningUpstream(pathSegments, url.search)
  const init: RequestInit = {
    method: req.method,
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
    },
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text()
  }
  return serverFetch(upstream, init)
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: pathSegments } = await ctx.params
  const res = await proxy(req, pathSegments)
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path: pathSegments } = await ctx.params
  const res = await proxy(req, pathSegments)
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
