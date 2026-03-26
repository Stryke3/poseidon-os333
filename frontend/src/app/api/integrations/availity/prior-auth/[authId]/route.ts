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
  { params }: { params: Promise<{ authId: string }> },
) {
  const gate = await gateAvailityApiRequest(req)
  const blocked = takeAvailityGateFailure(gate)
  if (blocked) return blocked

  const { authId } = await params
  const u = new URL(req.url)
  const caseId = u.searchParams.get("caseId")
  const q = caseId ? `?caseId=${encodeURIComponent(caseId)}` : ""
  const url = `${availityServiceBaseUrl()}${AVAILITY_INTEGRATION_PATH}/prior-auth/${encodeURIComponent(authId)}${q}`

  const res = await serverFetch(url, { method: "GET" })
  const body = await res.text()
  return new NextResponse(body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
    },
  })
}
