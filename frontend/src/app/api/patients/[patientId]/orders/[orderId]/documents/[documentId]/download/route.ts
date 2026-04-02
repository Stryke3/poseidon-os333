import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { logChartContainmentFailure, logChartProxyOk, logUnauthorizedAttempt } from "@/lib/chart-proxy-log"
import { getServiceBaseUrl } from "@/lib/runtime-config"

const CORE_API_URL = getServiceBaseUrl("POSEIDON_API_URL")

/** Parse "host:port" or CSV hosts from env; hostnames only, lowercased. */
function hostsFromEnv(value: string | undefined): string[] {
  if (!value?.trim()) return []
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(":")[0].toLowerCase())
}

/**
 * True for typical internal MinIO hostnames (Compose/Kubernetes), e.g. minio, minio-8886, minio.namespace.svc.
 * Does not match unrelated domains (e.g. evilminio.com).
 */
function isInternalMinioHostname(host: string): boolean {
  const h = host.toLowerCase()
  if (h === "minio") return true
  const first = h.split(".")[0] ?? h
  if (first === "minio") return true
  if (first.startsWith("minio-")) return true
  return false
}

/**
 * Presigned URLs must point at an explicitly allowed object-storage host.
 * Configure via ALLOWED_STORAGE_DOWNLOAD_HOSTS, MINIO_ENDPOINT, MINIO_PUBLIC_ENDPOINT, etc.
 */
function isAllowedStorageUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
    const host = parsed.hostname.toLowerCase()
    if (isInternalMinioHostname(host)) return true
    const allow = new Set<string>([
      "localhost",
      "127.0.0.1",
      ...hostsFromEnv(process.env.MINIO_ENDPOINT),
      ...hostsFromEnv(process.env.MINIO_PUBLIC_ENDPOINT),
      ...hostsFromEnv(process.env.NEXT_PUBLIC_MINIO_HOST),
      ...hostsFromEnv(process.env.ALLOWED_STORAGE_DOWNLOAD_HOSTS),
    ])
    return allow.has(host)
  } catch {
    return false
  }
}

/**
 * Proxy document downloads so the browser never needs to reach internal MinIO.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ patientId: string; orderId: string; documentId: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.accessToken) {
    logUnauthorizedAttempt("document_download_GET")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { patientId, orderId, documentId } = await params

  const chartRes = await fetch(`${CORE_API_URL}/patients/${patientId}/chart`, {
    headers: {
      Authorization: `Bearer ${session.user.accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })
  if (!chartRes.ok) {
    const err = await chartRes.json().catch(() => ({ error: "Upstream error" }))
    return NextResponse.json(err, { status: chartRes.status })
  }
  const chart = (await chartRes.json()) as { orders?: { id?: string }[] }
  const onChart = (chart.orders || []).some((o) => String(o.id) === String(orderId))
  if (!onChart) {
    logChartContainmentFailure("document_download_GET", patientId, orderId, "order_not_on_patient_chart")
    return NextResponse.json({ error: "Order not found for this patient" }, { status: 404 })
  }

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
  if (!isAllowedStorageUrl(download_url)) {
    console.warn(
      JSON.stringify({
        event: "document_download_blocked_host",
        patient_id: patientId,
        order_id: orderId,
        document_id: documentId,
        host: (() => {
          try {
            return new URL(download_url).hostname
          } catch {
            return "invalid"
          }
        })(),
      }),
    )
    return NextResponse.json({ error: "Storage host not allowed for download proxy" }, { status: 502 })
  }

  let fileRes: Response
  try {
    fileRes = await fetch(download_url, { cache: "no-store" })
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "document_download_storage_unreachable",
        patient_id: patientId,
        order_id: orderId,
        document_id: documentId,
        detail: err instanceof Error ? err.message : String(err),
      }),
    )
    return NextResponse.json(
      { error: "Storage unreachable from application server (check network / MinIO hostname resolution)" },
      { status: 502 },
    )
  }
  if (!fileRes.ok) {
    return NextResponse.json({ error: "Failed to fetch document from storage" }, { status: 502 })
  }

  logChartProxyOk("document_download_proxy_ok", {
    patient_id: patientId,
    order_id: orderId,
    document_id: documentId,
  })

  const headers = new Headers()
  const ct = fileRes.headers.get("content-type")
  if (ct) headers.set("Content-Type", ct)
  const cl = fileRes.headers.get("content-length")
  if (cl) headers.set("Content-Length", cl)
  headers.set("Cache-Control", "private, max-age=3600")

  return new Response(fileRes.body, { status: 200, headers })
}
