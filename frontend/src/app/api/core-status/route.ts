import { NextResponse } from "next/server"
import { getServiceBaseUrl } from "@/lib/runtime-config"

export const dynamic = "force-dynamic"

type ReadyBody = { checks?: Record<string, string> }

export async function GET() {
  const coreApiUrl = getServiceBaseUrl("POSEIDON_API_URL")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(`${coreApiUrl}/ready`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
    let checks: Record<string, string> | undefined
    try {
      const body = (await res.json()) as ReadyBody
      checks = body.checks
    } catch {
      checks = undefined
    }

    return NextResponse.json({
      reachable: true,
      databaseOk: checks?.database === "ok",
      checks: checks ?? null,
      ready: res.ok,
      target: coreApiUrl,
    })
  } catch {
    return NextResponse.json({
      reachable: false,
      databaseOk: false,
      checks: null,
      ready: false,
      target: coreApiUrl,
    })
  } finally {
    clearTimeout(timeout)
  }
}
