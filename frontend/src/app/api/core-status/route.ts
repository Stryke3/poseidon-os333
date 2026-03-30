import { NextResponse } from "next/server"

const CORE_API_URLS = Array.from(
  new Set(
    [
      process.env.POSEIDON_API_URL,
      process.env.CORE_API_URL,
      "http://core:8001",
      "http://core-8cql:10000",
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
  )
)

type ReadyBody = { checks?: Record<string, string> }

export async function GET() {
  for (const baseUrl of CORE_API_URLS) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/ready`, {
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
        target: baseUrl,
      })
    } catch {
      clearTimeout(timeout)
      continue
    } finally {
      clearTimeout(timeout)
    }
  }

  return NextResponse.json({
    reachable: false,
    databaseOk: false,
    checks: null,
    ready: false,
    target: null,
  })
}
