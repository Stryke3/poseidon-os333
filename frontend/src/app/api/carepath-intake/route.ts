import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { randomUUID } from "crypto"

// ── Rate limiting ────────────────────────────────────────────────────────────
const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_WINDOW = 10
const rl = new Map<string, number[]>()

function clientIp(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for")
  return fwd ? (fwd.split(",")[0]?.trim() ?? "unknown") : (req.headers.get("x-real-ip") ?? "unknown")
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const cutoff = now - WINDOW_MS
  const hits = (rl.get(ip) ?? []).filter((t) => t >= cutoff)
  if (hits.length >= MAX_PER_WINDOW) { rl.set(ip, hits); return false }
  hits.push(now)
  rl.set(ip, hits)
  if (rl.size > 2000) {
    for (const [k, v] of Array.from(rl.entries())) {
      if (v.filter((t) => t >= now - WINDOW_MS).length === 0) rl.delete(k)
    }
  }
  return true
}

// ── Validation ───────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NPI_RE = /^\d{10}$/
const PHONE_RE = /^[0-9+().\-\s]{7,40}$/
const ICD_RE = /^[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?(,\s*[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?)*$/i
const HCPCS_RE = /^[A-Z0-9]{4,6}(,\s*[A-Z0-9]{4,6})*$/i
const PATHWAYS = new Set(["surgical", "mobility", "recovery", "maternity"])

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function esc(v: string) {
  return v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")
}

// ── Tebra-ready packet builder ────────────────────────────────────────────────
function buildTebraPacket(fields: Record<string, string>, referenceId: string) {
  const icd10Codes = fields.icd10
    ? fields.icd10.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : []

  const hcpcsCodes = fields.hcpcs
    ? fields.hcpcs.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : []

  return {
    _schema: "carepath-intake-v1",
    referenceId,
    generatedAt: new Date().toISOString(),
    source: "CarePath by StrykeFox Medical",
    supplierNpi: "1821959420",
    pathway: fields.pathway,
    patient: {
      firstName: fields.patFirst,
      lastName: fields.patLast,
      dateOfBirth: fields.patDob,
      gender: fields.patGender || "U",
      phone: fields.patPhone,
      state: fields.patState,
    },
    referringProvider: {
      name: fields.refName,
      npi: fields.refNpi,
      practice: fields.refPractice,
      phone: fields.refPhone,
      email: fields.refEmail || null,
    },
    insurance: {
      payerName: fields.payerName,
      memberId: fields.memberId,
      groupNumber: fields.groupNum || null,
      subscriberRelationship: fields.relationship,
    },
    billing: {
      icd10Codes,
      hcpcsCodes,
      placeOfService: "12", // Home / standard DME default
      orderingNpi: fields.refNpi,
    },
    clinicalNotes: fields.notes || null,
    auditTrail: {
      submittedAt: new Date().toISOString(),
      channel: "web-carepath-form",
      referenceId,
    },
  }
}

// ── Email body ────────────────────────────────────────────────────────────────
function buildEmailHtml(packet: ReturnType<typeof buildTebraPacket>) {
  const { patient, referringProvider, insurance, billing, pathway, referenceId } = packet

  const rows = [
    ["Reference ID", referenceId],
    ["Pathway", pathway.toUpperCase()],
    ["---", "---"],
    ["Patient", `${patient.firstName} ${patient.lastName}`],
    ["DOB", patient.dateOfBirth],
    ["Gender", patient.gender],
    ["Patient Phone", patient.phone],
    ["State", patient.state],
    ["---", "---"],
    ["Referring Physician", referringProvider.name],
    ["NPI", referringProvider.npi],
    ["Practice", referringProvider.practice],
    ["Practice Phone", referringProvider.phone],
    ["Practice Email", referringProvider.email ?? "—"],
    ["---", "---"],
    ["Payer", insurance.payerName],
    ["Member ID", insurance.memberId],
    ["Group #", insurance.groupNumber ?? "—"],
    ["Relationship", insurance.subscriberRelationship],
    ["---", "---"],
    ["ICD-10", billing.icd10Codes.join(", ") || "—"],
    ["HCPCS/CPT", billing.hcpcsCodes.join(", ") || "—"],
    ["Place of Service", billing.placeOfService],
  ]

  const tableRows = rows
    .map(([label, value]) =>
      label === "---"
        ? `<tr><td colspan="2" style="padding:4px 0;border-top:1px solid #e5e7eb;"></td></tr>`
        : `<tr>
            <td style="padding:5px 10px 5px 0;font-size:12px;color:#6b7280;font-weight:500;white-space:nowrap;vertical-align:top">${esc(label)}</td>
            <td style="padding:5px 0;font-size:12px;color:#111827;word-break:break-word">${esc(String(value))}</td>
           </tr>`,
    )
    .join("")

  return `
<div style="font-family:Arial,sans-serif;max-width:640px">
  <div style="background:#0B1F3A;padding:20px 24px;border-radius:8px 8px 0 0">
    <p style="margin:0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.5)">CarePath by StrykeFox Medical</p>
    <h1 style="margin:6px 0 0;font-size:20px;color:#fff;font-weight:700">New Patient Referral</h1>
    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.6)">Ref #${esc(referenceId)} · Tebra-Ready Packet</p>
  </div>
  <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <table style="width:100%;border-collapse:collapse">${tableRows}</table>
    ${packet.clinicalNotes ? `<div style="margin-top:16px;padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:6px"><p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.1em">Clinical Notes</p><p style="margin:0;font-size:13px;color:#374151;white-space:pre-wrap">${esc(packet.clinicalNotes)}</p></div>` : ""}
    <div style="margin-top:20px;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px">
      <p style="margin:0;font-size:11px;color:#1d4ed8;font-weight:600">TEBRA IMPORT READY</p>
      <p style="margin:4px 0 0;font-size:11px;color:#3b82f6">Full JSON packet attached · Supplier NPI: 1821959420 · POS: 12</p>
    </div>
  </div>
</div>`
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  // Honeypot
  if (clean(body.website)) return NextResponse.json({ status: "ok" })

  const fields: Record<string, string> = {}
  for (const key of [
    "pathway","refName","refNpi","refPractice","refPhone","refEmail",
    "patFirst","patLast","patDob","patGender","patPhone","patState",
    "payerName","memberId","groupNum","relationship",
    "icd10","hcpcs","notes",
  ]) {
    fields[key] = clean(body[key])
  }

  // Required field validation
  if (!PATHWAYS.has(fields.pathway)) {
    return NextResponse.json({ error: "Please select a CarePath pathway." }, { status: 400 })
  }
  const required = ["refName","refNpi","refPractice","refPhone","patFirst","patLast","patDob","patPhone","patState","payerName","memberId"]
  for (const f of required) {
    if (!fields[f]) return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 })
  }
  if (!NPI_RE.test(fields.refNpi)) {
    return NextResponse.json({ error: "NPI must be exactly 10 digits." }, { status: 400 })
  }
  if (!PHONE_RE.test(fields.refPhone) || !PHONE_RE.test(fields.patPhone)) {
    return NextResponse.json({ error: "Please provide a valid phone number." }, { status: 400 })
  }
  if (fields.refEmail && !EMAIL_RE.test(fields.refEmail)) {
    return NextResponse.json({ error: "Please provide a valid email." }, { status: 400 })
  }
  if (fields.icd10 && !ICD_RE.test(fields.icd10)) {
    return NextResponse.json({ error: "ICD-10 codes appear malformed. Use comma-separated codes (e.g. M79.3, Z96.641)." }, { status: 400 })
  }
  if (fields.hcpcs && !HCPCS_RE.test(fields.hcpcs)) {
    return NextResponse.json({ error: "HCPCS/CPT codes appear malformed. Use comma-separated codes (e.g. E0181, L1833)." }, { status: 400 })
  }

  const referenceId = `CP-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`
  const packet = buildTebraPacket(fields, referenceId)

  // ── Forward to Poseidon ───────────────────────────────────────────────────
  const poseidonUrl = process.env.POSEIDON_API_URL || process.env.CORE_API_URL
  if (poseidonUrl) {
    try {
      await fetch(`${poseidonUrl}/api/v1/carepath-intake`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": process.env.POSEIDON_INTERNAL_KEY ?? "",
          "X-Reference-Id": referenceId,
        },
        body: JSON.stringify(packet),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null) // non-blocking — email is canonical
    } catch {
      // Poseidon down does not block referral submission
    }
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  const recipient = process.env.PUBLIC_INQUIRY_TO || "patients@strykefox.com"
  const gmailUser = process.env.GMAIL_INTAKE_USER || process.env.EMAIL_INTAKE_USERNAME || ""
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID || ""
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET || ""
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN || ""

  if (!gmailUser || !clientId || !clientSecret || !refreshToken) {
    // Log the packet even if email is not configured (dev / CI environments)
    console.log("[carepath-intake] Email not configured. Packet:", JSON.stringify(packet, null, 2))
    return NextResponse.json({ status: "ok", referenceId })
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { type: "OAuth2", user: gmailUser, clientId, clientSecret, refreshToken },
  })

  await transporter.sendMail({
    from: `"CarePath Intake" <${gmailUser}>`,
    to: recipient,
    replyTo: fields.refEmail || undefined,
    subject: `[CarePath] ${fields.pathway.toUpperCase()} Referral — ${fields.patFirst} ${fields.patLast} | Ref #${referenceId}`,
    html: buildEmailHtml(packet),
    attachments: [
      {
        filename: `carepath-intake-${referenceId}.json`,
        content: JSON.stringify(packet, null, 2),
        contentType: "application/json",
      },
    ],
  })

  return NextResponse.json({ status: "ok", referenceId })
}
