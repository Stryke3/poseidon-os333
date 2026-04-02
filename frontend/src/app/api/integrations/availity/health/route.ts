import {
  availityServiceBaseUrl,
  AVAILITY_INTEGRATION_PATH,
} from "@/lib/availity-upstream"
import {
  gateAvailityApiRequest,
  takeAvailityGateFailure,
} from "@/lib/availity-api-security"
import { proxyUpstreamText } from "@/lib/upstream-proxy"

export async function GET(req: Request) {
  const gate = await gateAvailityApiRequest(req)
  const blocked = takeAvailityGateFailure(gate)
  if (blocked) return blocked

  const url = `${availityServiceBaseUrl()}${AVAILITY_INTEGRATION_PATH}/health`
  return proxyUpstreamText(url, { method: "GET" })
}
