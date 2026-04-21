import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import { correlationHeaders, internalApiKeyHeaders } from "@/lib/proxy-headers"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const INTAKE_API_URL = getServiceBaseUrl("INTAKE_API_URL")

export async function POST(req: NextRequest) {
  const token = await getToken({ req })
  if (!token?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const upstream = new FormData()
  upstream.append("file", file)

  const res = await fetch(`${INTAKE_API_URL}/api/v1/intake/upload`, {
    method: "POST",
    headers: {
      ...internalApiKeyHeaders(),
      ...correlationHeaders(req.headers),
    },
    body: upstream,
  }).catch(() => null)

  if (!res) {
    return NextResponse.json(
      { error: "Unable to reach intake service" },
      { status: 502 },
    )
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (data.kind === "pdf") {
    const { kind: _kind, ...rest } = data
    return NextResponse.json(rest, { status: res.status })
  }
  return NextResponse.json(data, { status: res.status })
}
