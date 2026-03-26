import { NextResponse } from "next/server"
import { availityServiceBaseUrl } from "@/lib/availity-upstream"
import {
  gateAvailityApiRequest,
  takeAvailityGateFailure,
} from "@/lib/availity-api-security"
import { serverFetch } from "@/lib/server-http"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ payerId: string }> },
) {
  const gate = await gateAvailityApiRequest(req)
  const blocked = takeAvailityGateFailure(gate)
  if (blocked) return blocked

  const { payerId } = await params
  const upstream = new URL(
    `${availityServiceBaseUrl()}/api/playbooks/${encodeURIComponent(payerId)}`,
  )
  const qs = new URL(req.url).searchParams.toString()
  if (qs) upstream.search = qs

  const res = await serverFetch(upstream.toString(), { method: "GET" })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
