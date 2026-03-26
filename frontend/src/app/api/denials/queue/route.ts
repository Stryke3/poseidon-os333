import { NextResponse } from "next/server"
import { availityServiceBaseUrl } from "@/lib/availity-upstream"
import {
  gateAvailityApiRequest,
  takeAvailityGateFailure,
} from "@/lib/availity-api-security"
import { serverFetch } from "@/lib/server-http"

const DENIALS_UPSTREAM_PATH = "/api/denials"

export async function GET(req: Request) {
  const gate = await gateAvailityApiRequest(req)
  const blocked = takeAvailityGateFailure(gate)
  if (blocked) return blocked

  const base = availityServiceBaseUrl().replace(/\/$/, "")
  const url = new URL(req.url)
  const qs = url.searchParams.toString()

  const upstream = `${base}${DENIALS_UPSTREAM_PATH}/queue${qs ? `?${qs}` : ""}`
  const res = await serverFetch(upstream, { method: "GET" })
  const text = await res.text()

  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}

