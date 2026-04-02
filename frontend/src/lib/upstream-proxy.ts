import { NextResponse } from "next/server"

import { serverFetch } from "@/lib/server-http"

function formatProxyError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return "fetch failed"
}

export async function proxyUpstreamText(url: string, init?: RequestInit): Promise<NextResponse> {
  try {
    const res = await serverFetch(url, init)
    const body = await res.text()
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "UpstreamUnavailable",
        message: formatProxyError(error),
        upstream: url,
      },
      { status: 502 },
    )
  }
}
