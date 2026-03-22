import { NextRequest, NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"

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

async function getCoreAuth(req: NextRequest) {
  const coreBase =
    process.env.POSEIDON_API_URL || process.env.CORE_API_URL || "http://poseidon_core:8001"
  const nextAuthSecret = process.env.NEXTAUTH_SECRET
  const allowServiceAccount =
    process.env.ALLOW_CORE_SERVICE_ACCOUNT_FALLBACK === "true" &&
    process.env.NODE_ENV !== "production"

  if (!nextAuthSecret && process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET is required in production for live ingest.")
  }

  const sessionToken = await getToken({
    req,
    secret: nextAuthSecret,
  })

  if (typeof sessionToken?.accessToken === "string" && sessionToken.accessToken) {
    return { coreBase, token: sessionToken.accessToken }
  }

  if (!allowServiceAccount) {
    throw new Error("Live ingest requires an authenticated operator session.")
  }

  const email = process.env.CORE_API_EMAIL || ""
  const password = process.env.CORE_API_PASSWORD || ""

  if (!email || !password) {
    throw new Error(
      "Live ingest is not configured. Sign in again or set CORE_API_EMAIL and CORE_API_PASSWORD.",
    )
  }

  const authRes = await fetch(`${coreBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  })

  if (!authRes.ok) {
    throw new Error(`Core auth failed: ${authRes.status}`)
  }

  const authJson = await authRes.json()
  return { coreBase, token: authJson.access_token as string }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 })
    }

    if (!/\.csv$/i.test(file.name)) {
      return NextResponse.json(
        { error: "Accepted format: .csv" },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const rows = parseRows(buffer)
    const orders = mapRowsToOrders(rows)

    if (!orders.length) {
      return NextResponse.json(
        { error: "No usable patient rows were found in the uploaded file." },
        { status: 400 },
      )
    }

    const { coreBase, token } = await getCoreAuth(req)
    const internalKey = process.env.INTERNAL_API_KEY?.trim() ?? ""
    const importHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }
    if (internalKey) {
      importHeaders["X-Internal-API-Key"] = internalKey
    }
    const importRes = await fetch(`${coreBase}/orders/import`, {
      method: "POST",
      headers: importHeaders,
      body: JSON.stringify({ orders }),
      cache: "no-store",
    })

    const importJson = await importRes.json()
    if (!importRes.ok) {
      return NextResponse.json(
        {
          error:
            importJson?.detail || `Core import failed: ${importRes.status}`,
        },
        { status: importRes.status },
      )
    }

    const aggregatedImports = aggregateImportedOrders(orders)

    return NextResponse.json({
      status: "ok",
      sourceFile: file.name,
      parsedRows: rows.length,
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
    const message =
      error instanceof Error ? error.message : "Live ingest failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
