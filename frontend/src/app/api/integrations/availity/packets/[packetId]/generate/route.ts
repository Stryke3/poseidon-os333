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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ packetId: string }> },
) {
  const gate = await gateAvailityApiRequest(req)
  const blocked = takeAvailityGateFailure(gate)
  if (blocked) return blocked

  const { packetId } = await params
  const url = `${availityServiceBaseUrl()}${AVAILITY_INTEGRATION_PATH}/packets/${encodeURIComponent(packetId)}/generate`
  const body = await req.text()
  const res = await serverFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
    },
    body,
  })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
    },
  })
}
