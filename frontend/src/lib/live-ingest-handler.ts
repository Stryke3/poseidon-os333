import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { getAuthClaimsFromRequest } from "@/lib/auth-from-request"
import { getRequiredEnv, getServiceBaseUrl } from "@/lib/runtime-config"

interface ImportOrderPayload {
  patient_name: string
  first_name?: string
  last_name?: string
  dob?: string
  email?: string
  insurance_id?: string
  payer?: string
  payer_id?: string
  hcpcs?: string
  hcpcs_codes?: string[]
  npi?: string
  referring_physician_npi?: string
  icd?: string
  diagnosis_codes?: string[]
  priority?: string
  notes?: string
}

type AggregatedImportRecord = {
  id: string
  patient_name: string
  payer: string
  hcpcs: string
  orderCount: number
}

type CorePatientCreateResponse = {
  patient_id?: string
  status?: string
  detail?: string
  error?: string
}

type CoreOrderCreateResponse = {
  order_id?: string
  status?: string
  assigned_to?: string
  detail?: string
  error?: string
}

const INTAKE_REQUEST_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.INTAKE_REQUEST_TIMEOUT_MS || "60000")
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60000
})()

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

function rowValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const direct = row[key]
    if (direct != null && String(direct).trim()) return String(direct).trim()
  }
  return ""
}

function splitName(fullName: string) {
  const trimmed = fullName.trim()
  if (!trimmed) return { first_name: "", last_name: "Unknown" }
  if (trimmed.includes(",")) {
    const [last, first] = trimmed.split(",", 2).map((part) => part.trim())
    return { first_name: first || "", last_name: last || "Unknown" }
  }
  const parts = trimmed.split(/\s+/)
  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" ") || "Unknown",
  }
}

function normalizeDob(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return "1970-01-01"
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const [, mm, dd, yyyy] = slash
    const year = yyyy.length === 2 ? `20${yyyy}` : yyyy
    return `${year.padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`
  }
  return trimmed
}

type ParsedPdfDocument = {
  patient_name?: string
  first_name?: string
  last_name?: string
  date_of_birth?: string
  insurance_info?: {
    payer_name?: string
    member_id?: string
  }
  physician_npi?: string
  hcpcs_codes?: string[]
  diagnosis_codes?: string[]
  raw_text_preview?: string
}

function mapRowsToOrders(rows: Record<string, unknown>[]) {
  return rows
    .map((raw) => {
      const row = Object.fromEntries(
        Object.entries(raw).map(([key, value]) => [normalizeKey(key), value]),
      )

      const patient_name =
        rowValue(row, ["patient_name", "patient", "patient_full_name", "name", "full_name"]) ||
        `${rowValue(row, ["first_name", "firstname", "first"])} ${rowValue(row, [
          "last_name",
          "lastname",
          "last",
        ])}`.trim()

      if (!patient_name) return null

      const nameParts = splitName(patient_name)
      const hcpcsRaw = rowValue(row, ["hcpcs", "hcpcs_code", "hcpcs_codes", "code"])
      const diagnosisRaw = rowValue(row, [
        "icd",
        "diagnosis_code",
        "diagnosis_codes",
        "dx",
      ])

      const order: ImportOrderPayload = {
        patient_name,
        first_name: rowValue(row, ["first_name", "firstname", "first"]) || nameParts.first_name,
        last_name: rowValue(row, ["last_name", "lastname", "last"]) || nameParts.last_name,
        dob: normalizeDob(rowValue(row, ["dob", "date_of_birth", "birth_date"])),
        email: rowValue(row, ["email", "patient_email"]),
        insurance_id: rowValue(row, [
          "insurance_id",
          "member_id",
          "subscriber_id",
          "patient_acct_no",
          "claim_no",
        ]),
        payer: rowValue(row, ["payer", "payer_name", "payer_name_2", "insurance"]),
        payer_id: rowValue(row, ["payer_id", "payer_name", "payer_name_2"]),
        hcpcs: hcpcsRaw || rowValue(row, ["cpt_code"]),
        hcpcs_codes: hcpcsRaw
          ? hcpcsRaw
              .split(/[,\s]+/)
              .map((item) => item.trim().toUpperCase())
              .filter(Boolean)
          : rowValue(row, ["cpt_code"])
              .split(/[,\s]+/)
              .map((item) => item.trim().toUpperCase())
              .filter(Boolean) || undefined,
        icd: diagnosisRaw,
        diagnosis_codes: diagnosisRaw
          ? diagnosisRaw
              .split(/[,\s]+/)
              .map((item) => item.trim().toUpperCase().replace(/\./g, ""))
              .filter(Boolean)
          : rowValue(row, ["icd1_code", "icd2_code", "icd3_code", "icd4_code"])
              .split(/[,\s]+/)
              .map((item) => item.trim().toUpperCase().replace(/\./g, ""))
              .filter(Boolean) || undefined,
        npi: rowValue(row, ["npi", "provider_npi"]),
        referring_physician_npi: rowValue(row, ["referring_physician_npi", "referring_npi"]),
        priority: rowValue(row, ["priority"]) || "standard",
        notes:
          rowValue(row, ["notes", "note", "comments"]) ||
          [
            rowValue(row, ["current_claim_status"]),
            rowValue(row, ["payment_type"]),
            rowValue(row, ["payment"]),
          ]
            .filter(Boolean)
            .join(" | "),
      }

      return order
    })
    .filter((item): item is ImportOrderPayload => Boolean(item))
}

function mapParsedPdfToOrders(parsed: ParsedPdfDocument): ImportOrderPayload[] {
  const combinedName = `${parsed.first_name?.trim() || ""} ${parsed.last_name?.trim() || ""}`.trim()
  const patientName = parsed.patient_name?.trim() || combinedName
  if (!patientName) return []

  const nameParts = splitName(patientName)
  const diagnosisCodes = (parsed.diagnosis_codes || [])
    .map((code) => String(code || "").trim().toUpperCase().replace(/\./g, ""))
    .filter(Boolean)
  let hcpcsCodes = (parsed.hcpcs_codes || [])
    .map((code) => String(code || "").trim().toUpperCase())
    .filter(Boolean)
  if (!hcpcsCodes.length && diagnosisCodes.length) {
    hcpcsCodes = inferHcpcsFromDiagnosis(diagnosisCodes)
  }

  return [
    {
      patient_name: patientName,
      first_name: parsed.first_name?.trim() || nameParts.first_name,
      last_name: parsed.last_name?.trim() || nameParts.last_name,
      dob: normalizeDob(parsed.date_of_birth || ""),
      insurance_id: parsed.insurance_info?.member_id?.trim() || "",
      payer: parsed.insurance_info?.payer_name?.trim() || "",
      payer_id: parsed.insurance_info?.payer_name?.trim() || "",
      hcpcs: hcpcsCodes[0] || "",
      hcpcs_codes: hcpcsCodes,
      icd: diagnosisCodes[0] || "",
      diagnosis_codes: diagnosisCodes,
      referring_physician_npi: parsed.physician_npi?.trim() || "",
      priority: "standard",
      notes: `PDF intake: ${parsed.patient_name || "document"}`,
    },
  ]
}

function aggregateImportedOrders(orders: ImportOrderPayload[]) {
  const grouped = new Map<string, AggregatedImportRecord>()

  for (const order of orders) {
    const patientName = order.patient_name || "Unknown Patient"
    const payer = order.payer || order.payer_id || "Unknown"
    const hcpcs = order.hcpcs_codes?.[0] || order.hcpcs || "Order"
    const key = `${patientName.toLowerCase()}::${payer.toLowerCase()}`
    const existing = grouped.get(key)

    if (!existing) {
      grouped.set(key, {
        id: key,
        patient_name: patientName,
        payer,
        hcpcs,
        orderCount: 1,
      })
      continue
    }

    existing.orderCount += 1
  }

  return Array.from(grouped.values())
}

async function safeJson<T>(res: Response) {
  const raw = await res.text().catch(() => "")
  if (!raw) return {} as T
  try {
    return JSON.parse(raw) as T
  } catch {
    return ({ error: raw.slice(0, 500) } as unknown) as T
  }
}

function normalizeDiagnosisCodes(order: ImportOrderPayload) {
  const codes = (order.diagnosis_codes || [])
    .map((code) => String(code || "").trim().toUpperCase().replace(/\./g, ""))
    .filter(Boolean)
  if (codes.length > 0) return codes
  if (order.icd?.trim()) return [order.icd.trim().toUpperCase().replace(/\./g, "")]
  return ["Z00.00"]
}

const ICD10_TO_HCPCS: Array<[string[], string[], string]> = [
  [["M17", "M23", "M2556", "M2557"], ["L1833"], "knee-bracing"],
  [["M16", "M2445", "M2555"], ["L1686"], "hip-bracing"],
  [["G82", "G80", "G35", "R26"], ["K0823"], "mobility"],
  [["M54", "M51", "M48"], ["L0650"], "lumbar-bracing"],
]

function inferHcpcsFromDiagnosis(diagnosisCodes: string[]): string[] {
  const normalized = diagnosisCodes
    .map((c) => String(c || "").toUpperCase().replace(/\./g, ""))
    .filter(Boolean)
  for (const [prefixes, hcpcs] of ICD10_TO_HCPCS) {
    for (const code of normalized) {
      if (prefixes.some((p) => code.startsWith(p))) return [...hcpcs]
    }
  }
  return []
}

function normalizeHcpcsCodes(order: ImportOrderPayload) {
  const codes = (order.hcpcs_codes || [])
    .map((code) => String(code || "").trim().toUpperCase())
    .filter(Boolean)
  if (codes.length > 0) return codes
  if (order.hcpcs?.trim()) return [order.hcpcs.trim().toUpperCase()]
  const inferred = inferHcpcsFromDiagnosis(order.diagnosis_codes || [])
  if (inferred.length > 0) return inferred
  return []
}

async function getCoreAuth(req: NextRequest) {
  const coreBase = getServiceBaseUrl("POSEIDON_API_URL")
  const claims = await getAuthClaimsFromRequest(req)
  if (!claims?.accessToken) {
    throw new Error("Live ingest requires an authenticated operator session.")
  }
  return { coreBase, token: claims.accessToken }
}

type IntakeUploadSuccess =
  | ({ kind: "pdf" } & ParsedPdfDocument & Record<string, unknown>)
  | { kind: "csv"; rows: Record<string, unknown>[] }

async function forwardFileToIntakeService(file: File): Promise<
  | { ok: true; data: IntakeUploadSuccess }
  | { ok: false; status: number; body: unknown; rawText: string; url: string }
> {
  const base = process.env.INTAKE_API_URL?.trim().replace(/\/$/, "")
  if (!base) {
    console.error(
      JSON.stringify({ event: "intake_upload_config", error: "INTAKE_API_URL is not set" }),
    )
    throw new Error("INTAKE_API_URL is not configured.")
  }
  const internalKey = process.env.INTERNAL_API_KEY?.trim()
  if (!internalKey) {
    console.error(
      JSON.stringify({ event: "intake_upload_config", error: "INTERNAL_API_KEY is not set" }),
    )
    throw new Error("INTERNAL_API_KEY is not configured.")
  }

  const url = `${base}/api/v1/intake/upload`
  const outbound = new FormData()
  outbound.append("file", file, file.name)

  let res: Response
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), INTAKE_REQUEST_TIMEOUT_MS)
    res = await fetch(url, {
      method: "POST",
      body: outbound,
      headers: {
        "X-Internal-API-Key": internalKey,
        "X-Correlation-ID": randomUUID(),
      },
      cache: "no-store",
      signal: ac.signal,
    })
    clearTimeout(timer)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(
      JSON.stringify({
        event: "intake_upload_fetch_exception",
        url,
        error: msg,
      }),
    )
    throw new Error(`Unable to reach intake service (${msg}).`)
  }

  const rawText = await res.text()
  let body: unknown = {}
  try {
    body = rawText ? JSON.parse(rawText) : {}
  } catch {
    body = { error: rawText.slice(0, 800) }
  }

  if (!res.ok) {
    console.error(
      JSON.stringify({
        event: "intake_upload_upstream_error",
        url,
        status: res.status,
        bodyPreview:
          typeof body === "object" && body !== null
            ? body
            : { raw: rawText.slice(0, 400) },
      }),
    )
    return { ok: false, status: res.status, body, rawText, url }
  }

  return { ok: true, data: body as IntakeUploadSuccess }
}

function stripPdfKind(parsed: Record<string, unknown>): ParsedPdfDocument {
  const { kind: _k, ...rest } = parsed
  return rest as ParsedPdfDocument
}

async function createPatientsAndOrdersDirectly(coreBase: string, token: string, orders: ImportOrderPayload[]) {
  const patientIds = new Map<string, string>()
  const results: Array<{ patient_id?: string; order_id?: string; patient_name: string; payer: string }> = []

  for (const order of orders) {
    const firstName = (order.first_name || "").trim() || splitName(order.patient_name).first_name
    const lastName = (order.last_name || "").trim() || splitName(order.patient_name).last_name
    const dob = normalizeDob(order.dob || "")
    let payerId = (order.payer_id || order.payer || "").trim()
    const diagnosisCodes = normalizeDiagnosisCodes(order)
    let hcpcsCodes = normalizeHcpcsCodes(order)

    if (!payerId) {
      payerId = "UNKNOWN"
    }
    if (!hcpcsCodes.length) {
      hcpcsCodes = inferHcpcsFromDiagnosis(diagnosisCodes)
    }

    const patientKey = [
      firstName.toLowerCase(),
      lastName.toLowerCase(),
      dob,
      (order.insurance_id || "").trim().toLowerCase(),
      payerId.toLowerCase(),
    ].join("::")

    let patientId = patientIds.get(patientKey)
    if (!patientId) {
      const patientRes = await fetch(`${coreBase}/patients`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          dob,
          email: order.email?.trim() || undefined,
          phone: undefined,
          insurance_id: (order.insurance_id || "").trim() || `AUTO-${Date.now()}`,
          payer_id: payerId,
          diagnosis_codes: diagnosisCodes,
          address: {},
        }),
        cache: "no-store",
      }).catch(() => null)

      if (!patientRes) {
        throw new Error(`Unable to create patient for ${order.patient_name}.`)
      }
      const patientJson = await safeJson<CorePatientCreateResponse>(patientRes)
      if (!patientJson.patient_id) {
        throw new Error(patientJson.detail || patientJson.error || `Patient creation failed for ${order.patient_name}.`)
      }
      if (!patientRes.ok && patientRes.status !== 409) {
        throw new Error(patientJson.detail || patientJson.error || `Patient creation failed for ${order.patient_name}.`)
      }
      patientId = patientJson.patient_id
      patientIds.set(patientKey, patientId)
    }

    const npi = (order.referring_physician_npi || order.npi || "").trim()
    const orderBody: Record<string, unknown> = {
      patient_id: patientId,
      payer_id: payerId,
      notes: order.notes?.slice(0, 500).trim() || undefined,
      priority: order.priority || "standard",
      source_channel: "manual",
      source_reference: "live-ingest-pdf",
      intake_payload: {
        patient_input: {
          first_name: firstName,
          last_name: lastName,
          dob,
          email: order.email?.trim() || null,
        },
        coding: {
          icd10_codes: diagnosisCodes,
          hcpcs_codes: hcpcsCodes,
        },
      },
      vertical: "dme",
      product_category: "live-ingest",
      source: "manual",
    }
    if (hcpcsCodes.length) orderBody.hcpcs_codes = hcpcsCodes
    if (npi) orderBody.referring_physician_npi = npi

    const orderRes = await fetch(`${coreBase}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderBody),
      cache: "no-store",
    }).catch(() => null)

    if (!orderRes) {
      throw new Error(`Unable to create order for ${order.patient_name}.`)
    }
    const orderJson = await safeJson<CoreOrderCreateResponse>(orderRes)
    if (!orderRes.ok || !orderJson.order_id) {
      throw new Error(orderJson.detail || orderJson.error || `Order creation failed for ${order.patient_name}.`)
    }

    results.push({
      patient_id: patientId,
      order_id: orderJson.order_id,
      patient_name: order.patient_name,
      payer: order.payer || payerId,
    })
  }

  return {
    created: results.length,
    failed: 0,
    skipped_duplicate: 0,
    patients_created: patientIds.size,
    orders_created: results.length,
    results,
    mode: "direct_fallback",
  }
}

export async function handleLiveIngestPost(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 })
    }

    if (!/\.(csv|pdf)$/i.test(file.name)) {
      return NextResponse.json(
        { error: "Accepted formats: .csv, .pdf" },
        { status: 400 },
      )
    }

    const { coreBase, token } = await getCoreAuth(req)
    const isPdf = /\.pdf$/i.test(file.name)

    const upstream = await forwardFileToIntakeService(file)
    if (upstream.ok === false) {
      return NextResponse.json(upstream.body, { status: upstream.status })
    }

    const payload = upstream.data
    let orders: ImportOrderPayload[]
    let parsedRowCount: number

    if (isPdf) {
      if (payload.kind !== "pdf") {
        return NextResponse.json(
          { error: "Intake service returned unexpected payload for PDF." },
          { status: 502 },
        )
      }
      const parsed = stripPdfKind(payload as Record<string, unknown>)
      if (!parsed.patient_name?.trim()) {
        return NextResponse.json(
          { error: "No usable patient data was found in the uploaded PDF." },
          { status: 400 },
        )
      }
      orders = mapParsedPdfToOrders(parsed)
      parsedRowCount = 1
    } else {
      if (payload.kind !== "csv" || !Array.isArray(payload.rows)) {
        return NextResponse.json(
          { error: "Intake service returned unexpected payload for CSV." },
          { status: 502 },
        )
      }
      orders = mapRowsToOrders(payload.rows as Record<string, unknown>[])
      parsedRowCount = payload.rows.length
    }

    if (!orders.length) {
      return NextResponse.json(
        {
          error: isPdf
            ? "No usable patient data was found in the uploaded PDF."
            : "No usable patient rows were found in the uploaded file.",
        },
        { status: 400 },
      )
    }

    const internalKey = process.env.INTERNAL_API_KEY?.trim() ?? ""
    let importJson: unknown

    if (internalKey) {
      const importHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Internal-API-Key": internalKey,
      }
      const importRes = await fetch(`${coreBase}/orders/import`, {
        method: "POST",
        headers: importHeaders,
        body: JSON.stringify({ orders }),
        cache: "no-store",
      }).catch(() => null)

      if (!importRes) {
        return NextResponse.json({ error: "Unable to reach Core import service." }, { status: 502 })
      }

      importJson = await safeJson<Record<string, unknown>>(importRes)
      if (!importRes.ok) {
        return NextResponse.json(
          {
            error:
              (importJson as { detail?: string; error?: string })?.detail ||
              (importJson as { error?: string })?.error ||
              `Core import failed: ${importRes.status}`,
          },
          { status: importRes.status },
        )
      }
    } else {
      importJson = await createPatientsAndOrdersDirectly(coreBase, token, orders)
    }

    const aggregatedImports = aggregateImportedOrders(orders)

    return NextResponse.json({
      status: "ok",
      sourceFile: file.name,
      parsedRows: parsedRowCount,
      submittedOrders: orders.length,
      importResult: importJson,
      ingestedPatients: aggregatedImports.map((patient, index) => ({
        id: `LIVE-${Date.now()}-${index}`,
        name: patient.patient_name,
        payer: patient.payer,
        status: "active",
        value: "Pending",
        type: `${patient.orderCount} ${patient.orderCount === 1 ? "order" : "orders"} · ${patient.hcpcs}`,
        orderCount: patient.orderCount,
      })),
      ingestedCards: aggregatedImports.map((patient, index) => ({
        id: `LIVE-${Date.now()}-${index}`,
        title: `${patient.patient_name} - ${patient.hcpcs} - ${patient.payer}`,
        value: "Pending",
        priority: "med",
        assignee: "IN",
        payer: patient.payer,
        type: `${patient.orderCount} ${patient.orderCount === 1 ? "order" : "orders"}`,
        due: new Date().toISOString().slice(0, 10),
        orderCount: patient.orderCount,
      })),
    })
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "live_ingest_handler_error",
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Live ingest failed." },
      { status: 500 },
    )
  }
}
