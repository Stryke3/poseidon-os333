import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import { getRequiredEnv, getServiceBaseUrl } from "@/lib/runtime-config"

const INTAKE_API_URL = getServiceBaseUrl("INTAKE_API_URL")

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

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ""
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

function parseRows(buffer: Buffer) {
  const content = buffer.toString("utf-8").replace(/^\uFEFF/, "")
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return []

  const headers = parseCsvLine(lines[0]).map(normalizeKey)
  const rows: Record<string, unknown>[] = []

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line)
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] || ""]),
    )
    rows.push(row)
  }

  return rows
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
  const hcpcsCodes = (parsed.hcpcs_codes || [])
    .map((code) => String(code || "").trim().toUpperCase())
    .filter(Boolean)
  const diagnosisCodes = (parsed.diagnosis_codes || [])
    .map((code) => String(code || "").trim().toUpperCase().replace(/\./g, ""))
    .filter(Boolean)
  const notes = parsed.raw_text_preview?.trim() || "Imported from PDF intake document."

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
      notes,
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

async function getCoreAuth(req: NextRequest) {
  const coreBase = getServiceBaseUrl("POSEIDON_API_URL")
  const nextAuthSecret = getRequiredEnv("NEXTAUTH_SECRET")

  const sessionToken = await getToken({
    req,
    secret: nextAuthSecret,
  })

  if (typeof sessionToken?.accessToken === "string" && sessionToken.accessToken) {
    return { coreBase, token: sessionToken.accessToken }
  }

  throw new Error("Live ingest requires an authenticated operator session.")
}

async function parsePdfDocument(file: File, token: string) {
  const upstream = new FormData()
  upstream.append("file", file, file.name)

  const res = await fetch(`${INTAKE_API_URL}/api/v1/intake/parse-document`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: upstream,
    cache: "no-store",
  }).catch(() => null)

  if (!res) {
    throw new Error("Unable to reach intake document parser.")
  }

  const data = (await res.json().catch(() => null)) as ParsedPdfDocument | { detail?: string } | null
  if (!res.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data && typeof data.detail === "string"
        ? data.detail
        : `PDF parsing failed: ${res.status}`
    throw new Error(detail)
  }

  return (data || {}) as ParsedPdfDocument
}

function normalizeDiagnosisCodes(order: ImportOrderPayload) {
  const codes = (order.diagnosis_codes || [])
    .map((code) => String(code || "").trim().toUpperCase().replace(/\./g, ""))
    .filter(Boolean)
  if (codes.length > 0) return codes
  if (order.icd?.trim()) return [order.icd.trim().toUpperCase().replace(/\./g, "")]
  return ["Z00.00"]
}

function normalizeHcpcsCodes(order: ImportOrderPayload) {
  const codes = (order.hcpcs_codes || [])
    .map((code) => String(code || "").trim().toUpperCase())
    .filter(Boolean)
  if (codes.length > 0) return codes
  if (order.hcpcs?.trim()) return [order.hcpcs.trim().toUpperCase()]
  return []
}

async function createPatientsAndOrdersDirectly(coreBase: string, token: string, orders: ImportOrderPayload[]) {
  const patientIds = new Map<string, string>()
  const results: Array<{ patient_id?: string; order_id?: string; patient_name: string; payer: string }> = []

  for (const order of orders) {
    const firstName = (order.first_name || "").trim() || splitName(order.patient_name).first_name
    const lastName = (order.last_name || "").trim() || splitName(order.patient_name).last_name
    const dob = normalizeDob(order.dob || "")
    const payerId = (order.payer_id || order.payer || "").trim()
    const diagnosisCodes = normalizeDiagnosisCodes(order)
    const hcpcsCodes = normalizeHcpcsCodes(order)

    if (!payerId) {
      throw new Error(`Live ingest row for ${order.patient_name} is missing payer.`)
    }
    if (!hcpcsCodes.length) {
      throw new Error(`Live ingest row for ${order.patient_name} is missing HCPCS/device codes.`)
    }
    if (!(order.referring_physician_npi || order.npi || "").trim()) {
      throw new Error(`Live ingest row for ${order.patient_name} is missing referring physician NPI.`)
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
      if (!patientRes.ok || !patientJson.patient_id) {
        throw new Error(patientJson.detail || patientJson.error || `Patient creation failed for ${order.patient_name}.`)
      }
      patientId = patientJson.patient_id
      patientIds.set(patientKey, patientId)
    }

    const orderRes = await fetch(`${coreBase}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patient_id: patientId,
        hcpcs_codes: hcpcsCodes,
        referring_physician_npi: (order.referring_physician_npi || order.npi || "").trim(),
        payer_id: payerId,
        notes: order.notes?.trim() || undefined,
        priority: order.priority || "standard",
        source_channel: "manual",
        source_reference: "live-ingest-fallback",
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
      }),
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

export async function POST(req: NextRequest) {
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
    const buffer = isPdf ? null : Buffer.from(await file.arrayBuffer())
    const rows = buffer ? parseRows(buffer) : []
    const orders = isPdf
      ? mapParsedPdfToOrders(await parsePdfDocument(file, token))
      : mapRowsToOrders(rows)

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
      parsedRows: isPdf ? 1 : rows.length,
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Live ingest failed." },
      { status: 500 },
    )
  }
}
