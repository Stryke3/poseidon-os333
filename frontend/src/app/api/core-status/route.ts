import { NextResponse } from "next/server"
import { getServiceBaseUrl } from "@/lib/runtime-config"

export const dynamic = "force-dynamic"

type ReadyBody = { checks?: Record<string, string> }

export async function GET() {
  let coreApiUrl: string
  try {
    coreApiUrl = getServiceBaseUrl("POSEIDON_API_URL")
  } catch {
    return NextResponse.json({
      reachable: false,
      databaseOk: null,
      checks: null,
      ready: false,
      readyHttpStatus: null,
      target: null,
      configError: "Missing or invalid POSEIDON_API_URL / CORE_API_URL",
    })
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(`${coreApiUrl}/ready`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
    let checks: Record<string, string> | null | undefined
    try {
      const body = (await res.json()) as ReadyBody
      checks = body.checks ?? null
    } catch {
      checks = undefined
    }

    const databaseKnown = checks !== undefined && typeof checks?.database === "string"
    const databaseOk = databaseKnown ? checks!.database === "ok" : null

    return NextResponse.json({
      reachable: true,
      databaseOk,
      checks: checks ?? null,
      ready: res.ok,
      readyHttpStatus: res.status,
      target: coreApiUrl,
    })
  } catch {
    return NextResponse.json({
      reachable: false,
      databaseOk: null,
      checks: null,
      ready: false,
      readyHttpStatus: null,
      target: coreApiUrl,
    })
  } finally {
    clearTimeout(timeout)
  }
}
