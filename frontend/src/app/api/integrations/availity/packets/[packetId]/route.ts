import { NextResponse } from "next/server"
import {
  availityServiceBaseUrl,
  AVAILITY_INTEGRATION_PATH,
} from "@/lib/availity-upstream"
import {
  gateAvailityApiRequest,
  takeAvailityGateFailure,
} from "@/lib/availity-api-security"
import { serverFetch } from "@/lib/server-http"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ packetId: string }> },
) {
  const gate = await gateAvailityApiRequest(req)
  const blocked = takeAvailityGateFailure(gate)
  if (blocked) return blocked

  const { packetId } = await params
  const upstream = new URL(
    `${availityServiceBaseUrl()}${AVAILITY_INTEGRATION_PATH}/packets/${encodeURIComponent(packetId)}`,
  )
  const qs = new URL(req.url).searchParams.toString()
  if (qs) upstream.search = qs

  const res = await serverFetch(upstream.toString(), { method: "GET" })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
    },
  })
}
