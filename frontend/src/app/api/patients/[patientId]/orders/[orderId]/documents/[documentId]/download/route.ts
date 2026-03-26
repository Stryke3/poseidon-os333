import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"

const CORE_API_URL =
  process.env.POSEIDON_API_URL || process.env.CORE_API_URL || "http://poseidon_core:8001"

/**
 * Proxy document downloads so the browser never needs to reach the internal
 * MinIO hostname.  The core service returns a presigned URL that points at the
 * Docker-internal `minio:9000` endpoint – unreachable from the user's browser.
 * This route fetches the file server-side and streams it back.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ patientId: string; orderId: string; documentId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { orderId, documentId } = await params

  // 1. Ask core service for the presigned download URL
  const metaRes = await fetch(
    `${CORE_API_URL}/api/v1/orders/${orderId}/documents/${documentId}/download`,
    {
      headers: {
        Authorization: `Bearer ${session.user.accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  )

  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({ error: "Upstream error" }))
    return NextResponse.json(err, { status: metaRes.status })
  }

  const { download_url } = (await metaRes.json()) as { download_url: string }
  if (!download_url) {
    return NextResponse.json({ error: "No download URL available" }, { status: 404 })
  }

  // 2. Fetch the actual file from MinIO (server-side, internal network)
  const fileRes = await fetch(download_url, { cache: "no-store" })
  if (!fileRes.ok) {
    return NextResponse.json(
      { error: "Failed to fetch document from storage" },
      { status: 502 },
    )
  }

  // 3. Stream back to the browser with appropriate headers
  const headers = new Headers()
  const ct = fileRes.headers.get("content-type")
  if (ct) headers.set("Content-Type", ct)
  const cl = fileRes.headers.get("content-length")
  if (cl) headers.set("Content-Length", cl)
  headers.set("Cache-Control", "private, max-age=3600")

  return new Response(fileRes.body, { status: 200, headers })
}
