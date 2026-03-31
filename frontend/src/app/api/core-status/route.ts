import { NextResponse } from "next/server"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

type ReadyBody = { checks?: Record<string, string> }

export async function GET() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(`${CORE_API_URL}/ready`, {
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
      target: CORE_API_URL,
    })
  } catch {
    return NextResponse.json({
      reachable: false,
      databaseOk: false,
      checks: null,
      ready: false,
      target: CORE_API_URL,
    })
  } finally {
    clearTimeout(timeout)
  }
}
