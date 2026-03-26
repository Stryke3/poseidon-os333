import { NextResponse } from "next/server"
import { availityServiceBaseUrl } from "@/lib/availity-upstream"
import {
  gateAvailityApiRequest,
  takeAvailityGateFailure,
} from "@/lib/availity-api-security"
import { serverFetch } from "@/lib/server-http"

const VALIDATION_UPSTREAM_PATH = "/api/validation/pre-submit"

export async function POST(req: Request) {
  const gate = await gateAvailityApiRequest(req)
  const blocked = takeAvailityGateFailure(gate)
  if (blocked) return blocked

  const base = availityServiceBaseUrl().replace(/\/$/, "")
  const upstream = `${base}${VALIDATION_UPSTREAM_PATH}`

  const url = new URL(req.url)
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
    },
  }

  // Preserve request body exactly for deterministic server parsing.
  init.body = await req.text()

  const res = await serverFetch(upstream, init)
  const text = await res.text()

  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}

