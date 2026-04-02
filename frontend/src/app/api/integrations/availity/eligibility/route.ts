import {
  availityServiceBaseUrl,
  AVAILITY_INTEGRATION_PATH,
} from "@/lib/availity-upstream"
import {
  gateAvailityApiRequest,
  takeAvailityGateFailure,
} from "@/lib/availity-api-security"
import { proxyUpstreamText } from "@/lib/upstream-proxy"

export async function POST(req: Request) {
  const gate = await gateAvailityApiRequest(req)
  const blocked = takeAvailityGateFailure(gate)
  if (blocked) return blocked

  const url = `${availityServiceBaseUrl()}${AVAILITY_INTEGRATION_PATH}/eligibility`
  const body = await req.text()
  return proxyUpstreamText(url, {
    method: "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") || "application/json",
    },
    body,
  })
}
