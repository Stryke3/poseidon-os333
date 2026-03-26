import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import { clientKeyFromRequest, consumeAvailityRateLimit } from "@/lib/availity-rate-limit"

export type AvailityGateResult =
  | { ok: true }
  | { ok: false; response: NextResponse }

/** When `strict` is off, TS may not narrow `gate.ok`; use this for early return. */
export function takeAvailityGateFailure(
  gate: AvailityGateResult,
): NextResponse | undefined {
  if (gate.ok === false) return gate.response
  return undefined
}

/**
 * Rate limit + admin session for `/api/integrations/availity/*` proxies.
 * Availity OAuth secrets never touch the browser — only server env + Node service.
 */
export async function gateAvailityApiRequest(req: Request): Promise<AvailityGateResult> {
  const key = clientKeyFromRequest(req)
  if (!consumeAvailityRateLimit(key)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Too many requests — try again later" },
        { status: 429 },
      ),
    }
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  if (session.user.role !== "admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  return { ok: true as const }
}
