import { NextResponse } from "next/server"

import { getLiteBaseUrl, liteAuthHeaders } from "@/lib/lite-api"

function normalizeDate(value: unknown) {
  const raw = String(value || "").trim()
  return raw || null
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean)
  }
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const firstName = String(body.first_name || body.firstName || "").trim()
  const lastName = String(body.last_name || body.lastName || "").trim()

  const payload = {
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    dob: normalizeDate(body.dob),
    order_date: normalizeDate(body.order_date ?? body.orderDate),
    payer_name: String(body.payer_name ?? body.payer ?? "").trim() || null,
    ordering_provider: String(body.ordering_provider ?? body.provider_name ?? body.providerName ?? "").trim() || null,
    procedure_name: String(body.procedure_name ?? body.procedure ?? "").trim() || null,
    laterality: String(body.laterality ?? "").trim().toUpperCase() || null,
    diagnosis_codes: normalizeList(body.diagnosis_codes ?? body.diagnosisCodes).map((code) =>
      code.toUpperCase().replace(/\./g, ""),
    ),
    hcpcs_codes: normalizeList(body.hcpcs_codes ?? body.hcpcsCodes).map((code) =>
      code.toUpperCase(),
    ),
  }

  const res = await fetch(`${getLiteBaseUrl()}/patients/${caseId}`, {
    method: "PUT",
    headers: {
      ...liteAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  })

  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
  })
}
