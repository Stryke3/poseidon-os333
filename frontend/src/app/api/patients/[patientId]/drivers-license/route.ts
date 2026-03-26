import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"

const CORE_API_URL =
  process.env.POSEIDON_API_URL || process.env.CORE_API_URL || "http://poseidon_core:8001"

/**
 * Proxy driver's license image downloads so the browser never needs to reach
 * the internal MinIO hostname.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ patientId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { patientId } = await params

  const metaRes = await fetch(
    `${CORE_API_URL}/patients/${patientId}/drivers-license/download`,
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

  const fileRes = await fetch(download_url, { cache: "no-store" })
  if (!fileRes.ok) {
    return NextResponse.json(
      { error: "Failed to fetch document from storage" },
      { status: 502 },
    )
  }

  const headers = new Headers()
  const ct = fileRes.headers.get("content-type")
  if (ct) headers.set("Content-Type", ct)
  const cl = fileRes.headers.get("content-length")
  if (cl) headers.set("Content-Length", cl)
  headers.set("Cache-Control", "private, max-age=3600")

  return new Response(fileRes.body, { status: 200, headers })
}
