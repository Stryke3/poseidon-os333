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
  { params }: { params: Promise<{ caseId: string }> },
) {
  const gate = await gateAvailityApiRequest(req)
  const blocked = takeAvailityGateFailure(gate)
  if (blocked) return blocked

  const { caseId } = await params
  const url = `${availityServiceBaseUrl()}${AVAILITY_INTEGRATION_PATH}/packets/case/${encodeURIComponent(caseId)}`

  const res = await serverFetch(url, { method: "GET" })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
    },
  })
}
