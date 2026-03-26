import { NextResponse } from "next/server"
import { payerIntelligenceBaseUrl } from "@/lib/payer-intelligence-upstream"
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
  const encoded = encodeURIComponent(payerId)
  const url = `${payerIntelligenceBaseUrl()}/rules/${encoded}`
  const res = await serverFetch(url, { method: "GET" })
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
    },
  })
}
