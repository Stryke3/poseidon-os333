import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { getLiteBaseUrl, liteAuthHeaders } from "@/lib/lite-api"

export const runtime = "nodejs"

function normalizeDob(value: string | null | undefined) {
  const trimmed = String(value || "").trim()
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const [, mm, dd, yyyy] = slash
    const year = yyyy.length === 2 ? `20${yyyy}` : yyyy
    return `${year.padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`
  }
  return trimmed
}

function splitName(fullName: string) {
  const trimmed = fullName.trim()
  if (!trimmed) return { first_name: "", last_name: "" }
  if (trimmed.includes(",")) {
    const [last, first] = trimmed.split(",", 2).map((part) => part.trim())
    return { first_name: first || "", last_name: last || "" }
  }
  const parts = trimmed.split(/\s+/)
  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" ") || "",
  }
}

type ParsedPdfPayload = {
  kind?: string
  patient_name?: string
  first_name?: string
  last_name?: string
  date_of_birth?: string
  insurance_info?: {
    payer_name?: string
    member_id?: string
  }
  provider_name?: string
  procedure_name?: string
  order_date?: string
  laterality?: string
  physician_npi?: string
  hcpcs_codes?: string[]
  diagnosis_codes?: string[]
  raw_text_preview?: string
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]?.trim()) return match[1].trim()
  }
  return ""
}

function inferLaterality(text: string) {
  if (/\b(bilateral|bilat|both)\b/i.test(text)) return "BILATERAL"
  if (/\b(right|rt)\b/i.test(text)) return "RT"
  if (/\b(left|lt)\b/i.test(text)) return "LT"
  return null
}

function inferProcedure(text: string) {
  return (
    firstMatch(text, [
      /procedure\s*[:\-]\s*([^\n\r]+)/i,
      /surgery\s*[:\-]\s*([^\n\r]+)/i,
      /operation\s*[:\-]\s*([^\n\r]+)/i,
    ]) || null
  )
}

function inferProvider(text: string) {
  return (
    firstMatch(text, [
      /provider\s*[:\-]\s*([^\n\r]+)/i,
      /physician\s*[:\-]\s*([^\n\r]+)/i,
      /surgeon\s*[:\-]\s*([^\n\r]+)/i,
      /(dr\.?\s+[a-z ,.'-]+)/i,
    ]) || null
  )
}

function inferOrderDate(text: string) {
  const value =
    firstMatch(text, [
      /order\s*date\s*[:\-]\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i,
      /date\s*[:\-]\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{2,4})/i,
      /order\s*date\s*[:\-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i,
    ]) || null
  return normalizeDob(value)
}

function normalizeCodeList(value: unknown, dots = false) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean)
  }
  const raw = String(value || "").trim()
  if (!raw) return []
  const parsed = raw.startsWith("[") ? raw.replace(/^\[|\]$/g, "") : raw
  return parsed
    .split(/[,\n]/)
    .map((item) => item.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean)
    .map((item) => (dots ? item.toUpperCase().replace(/\./g, "") : item.toUpperCase()))
}

async function parseViaIntake(file: File) {
  const base = process.env.INTAKE_API_URL?.trim().replace(/\/$/, "")
  const internalKey = process.env.INTERNAL_API_KEY?.trim()

  if (!base || !internalKey) {
    throw new Error("Intake service is not configured.")
  }

  const outbound = new FormData()
  outbound.append("file", file, file.name)

  const response = await fetch(`${base}/api/v1/intake/upload`, {
    method: "POST",
    body: outbound,
    headers: {
      "X-Internal-API-Key": internalKey,
      "X-Correlation-ID": randomUUID(),
    },
    cache: "no-store",
  })

  const text = await response.text()
  const body = text ? JSON.parse(text) : {}
  if (!response.ok) {
    throw new Error(body?.detail || body?.error || "PDF parsing failed.")
  }
  return body as ParsedPdfPayload
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 })
    }
    if (!/\.pdf$/i.test(file.name)) {
      return NextResponse.json({ error: "Accepted format: .pdf" }, { status: 400 })
    }

    const parsed = await parseViaIntake(file)
    const preview = parsed.raw_text_preview?.trim() || ""
    const fullName = parsed.patient_name?.trim() || `${parsed.first_name || ""} ${parsed.last_name || ""}`.trim()
    if (!fullName) {
      return NextResponse.json({ error: "No usable patient data was found in the uploaded PDF." }, { status: 400 })
    }

    const name = splitName(fullName)
    const createBody = {
      first_name: parsed.first_name?.trim() || name.first_name,
      last_name: parsed.last_name?.trim() || name.last_name || "Unknown",
      dob: normalizeDob(parsed.date_of_birth),
      order_date: normalizeDob(parsed.order_date) || inferOrderDate(preview),
      payer_name: parsed.insurance_info?.payer_name?.trim() || null,
      member_id: parsed.insurance_info?.member_id?.trim() || null,
      ordering_provider: parsed.provider_name?.trim() || inferProvider(preview),
      procedure_name: parsed.procedure_name?.trim() || inferProcedure(preview),
      laterality: parsed.laterality?.trim().toUpperCase() || inferLaterality(preview),
      diagnosis_codes: normalizeCodeList(parsed.diagnosis_codes, true),
      hcpcs_codes: normalizeCodeList(parsed.hcpcs_codes),
      notes: preview || `PDF intake: ${file.name}`,
    }

    const createRes = await fetch(`${getLiteBaseUrl()}/patients`, {
      method: "POST",
      headers: {
        ...liteAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createBody),
      cache: "no-store",
    })
    const createText = await createRes.text()
    const created = createText ? JSON.parse(createText) : {}
    if (!createRes.ok || !created?.id) {
      return NextResponse.json({ error: created?.detail || created?.error || "Unable to create Trident case." }, { status: 502 })
    }

    const uploadBody = new FormData()
    uploadBody.append("category", "intake")
    uploadBody.append("file", file, file.name)

    const uploadRes = await fetch(`${getLiteBaseUrl()}/patients/${created.id}/documents`, {
      method: "POST",
      headers: liteAuthHeaders(),
      body: uploadBody,
      cache: "no-store",
    })
    const uploadText = await uploadRes.text()
    const uploaded = uploadText ? JSON.parse(uploadText) : {}
    if (!uploadRes.ok) {
      return NextResponse.json({ error: uploaded?.detail || uploaded?.error || "Case created but PDF attachment failed.", caseId: created.id }, { status: 502 })
    }

    return NextResponse.json({
      status: "ok",
      caseId: created.id,
      patientName: fullName,
      documentId: uploaded.id,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF ingest failed." },
      { status: 500 },
    )
  }
}
