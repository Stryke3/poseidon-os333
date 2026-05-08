"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSearch,
  FileText,
  Loader2,
  Play,
  ShieldCheck,
  UploadCloud,
} from "lucide-react"

type Priority = "standard" | "urgent" | "stat"

type StagedIntake = {
  first_name: string
  last_name: string
  dob: string
  mrn: string
  phone: string
  email: string
  payer_id: string
  insurance_id: string
  icd10_codes: string
  hcpcs_codes: string
  order_type: string
  referring_npi: string
  provider_name: string
  notes: string
  priority: Priority
}

type ParsedSignal = {
  label: string
  value: string
  confidence: "high" | "medium" | "low"
}

type OcrResult = {
  success?: boolean
  source?: "server" | "client"
  fileName?: string
  patientName?: string
  patient_name?: string
  firstName?: string
  first_name?: string
  lastName?: string
  last_name?: string
  dob?: string
  date_of_birth?: string
  mrn?: string
  insuranceId?: string
  insurance_id?: string
  payerName?: string
  payer_name?: string
  physicianNpi?: string
  physician_npi?: string
  diagnosisCodes?: string[]
  diagnosis_codes?: string[]
  hcpcsCodes?: string[]
  hcpcs_codes?: string[]
  rawText?: string
  raw_text_preview?: string
  confidence?: number
  message?: string
}

const EMPTY_STAGE: StagedIntake = {
  first_name: "",
  last_name: "",
  dob: "",
  mrn: "",
  phone: "",
  email: "",
  payer_id: "",
  insurance_id: "",
  icd10_codes: "",
  hcpcs_codes: "",
  order_type: "",
  referring_npi: "",
  provider_name: "",
  notes: "",
  priority: "standard",
}

const T = {
  bg: "#07111F",
  panel: "#0B1829",
  panelLift: "#10243B",
  border: "#203A5C",
  chrome: "#C2CDD8",
  muted: "#7F8FA3",
  blue: "#2B6FD4",
  blueSoft: "rgba(43, 111, 212, 0.16)",
  danger: "#EF5B5B",
  warning: "#D9A441",
  success: "#3BC27A",
}

function splitName(value: string) {
  const clean = value.replace(/\s+/g, " ").trim()
  if (!clean) return { first_name: "", last_name: "" }
  if (clean.includes(",")) {
    const [last, first] = clean.split(",", 2).map((part) => part.trim())
    return { first_name: first || "", last_name: last || "" }
  }
  const parts = clean.split(" ")
  return { first_name: parts[0] || "", last_name: parts.slice(1).join(" ") || "" }
}

function normalizeDob(value: string) {
  const clean = value.trim()
  if (!clean) return ""
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return clean
  const slash = clean.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/)
  if (!slash) return clean
  const [, mm, dd, rawYear] = slash
  const year = rawYear.length === 2 ? `19${rawYear}` : rawYear
  return `${year.padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`
}

function codes(value: string[] | undefined, fallbackText: string, pattern: RegExp) {
  const fromArray = (value || []).map((item) => item.trim().toUpperCase()).filter(Boolean)
  const fromText = Array.from(fallbackText.matchAll(pattern), (match) => match[0].toUpperCase().replace(/\.$/, ""))
  return Array.from(new Set([...fromArray, ...fromText])).slice(0, 8)
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]?.trim()) return match[1].trim()
  }
  return ""
}

function inferOrderType(text: string, hcpcsList: string[]) {
  const upper = text.toUpperCase()
  if (hcpcsList.includes("L1833") || upper.includes("KNEE")) return "Knee brace / orthotic"
  if (hcpcsList.includes("L1686") || upper.includes("HIP")) return "Hip brace / orthotic"
  if (hcpcsList.some((code) => code.startsWith("K0")) || upper.includes("WHEELCHAIR")) return "Mobility equipment"
  if (upper.includes("COLD THERAPY")) return "Cold therapy"
  if (upper.includes("DME")) return "DME order"
  return hcpcsList[0] ? `HCPCS ${hcpcsList[0]}` : ""
}

function extractFromText(raw: string, result?: OcrResult): { stage: StagedIntake; signals: ParsedSignal[]; rawText: string } {
  const rawText = raw || result?.rawText || result?.raw_text_preview || ""
  const patientName =
    result?.patientName ||
    result?.patient_name ||
    [result?.firstName || result?.first_name, result?.lastName || result?.last_name].filter(Boolean).join(" ") ||
    firstMatch(rawText, [
      /patient\s*name\s*[:#-]\s*([A-Z][A-Z ,.'-]{2,80})/i,
      /\bname\s*[:#-]\s*([A-Z][A-Z ,.'-]{2,80})/i,
    ])
  const name = splitName(patientName)
  const dob = normalizeDob(
    result?.dob ||
      result?.date_of_birth ||
      firstMatch(rawText, [
        /\bDOB\s*[:#-]\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
        /date\s*of\s*birth\s*[:#-]\s*([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
      ]),
  )
  const mrn =
    result?.mrn ||
    firstMatch(rawText, [
      /\bMRN\s*[:#-]\s*([A-Z0-9-]{4,24})/i,
      /medical\s*record\s*(?:number|#)?\s*[:#-]\s*([A-Z0-9-]{4,24})/i,
    ])
  const payer =
    result?.payerName ||
    result?.payer_name ||
    firstMatch(rawText, [
      /\bpayer\s*[:#-]\s*([A-Z0-9 &.'-]{2,60})/i,
      /\binsurance\s*[:#-]\s*([A-Z0-9 &.'-]{2,60})/i,
    ])
  const member =
    result?.insuranceId ||
    result?.insurance_id ||
    firstMatch(rawText, [
      /member\s*(?:id|#)\s*[:#-]\s*([A-Z0-9-]{4,30})/i,
      /subscriber\s*(?:id|#)\s*[:#-]\s*([A-Z0-9-]{4,30})/i,
    ])
  const icd10 = codes(result?.diagnosisCodes || result?.diagnosis_codes, rawText, /\b[A-TV-Z][0-9][0-9AB]\.?[0-9A-Z]{0,4}\b/g)
  const hcpcs = codes(result?.hcpcsCodes || result?.hcpcs_codes, rawText, /\b[A-Z][0-9]{4}\b/g)
  const npi =
    result?.physicianNpi ||
    result?.physician_npi ||
    firstMatch(rawText, [/\bNPI\s*[:#-]?\s*(\d{10})\b/i, /provider[^0-9]{0,24}(\d{10})\b/i])
  const provider = firstMatch(rawText, [
    /(?:ordering|referring|provider|physician)\s*(?:name)?\s*[:#-]\s*([A-Z][A-Z ,.'-]{2,80})/i,
  ])
  const orderType = inferOrderType(rawText, hcpcs)

  const stage: StagedIntake = {
    ...EMPTY_STAGE,
    first_name: result?.firstName || result?.first_name || name.first_name,
    last_name: result?.lastName || result?.last_name || name.last_name,
    dob,
    mrn,
    payer_id: payer.toUpperCase().replace(/\s+/g, "_"),
    insurance_id: member,
    icd10_codes: icd10.join(", "),
    hcpcs_codes: hcpcs.join(", "),
    order_type: orderType,
    referring_npi: npi,
    provider_name: provider,
    notes: rawText ? `Parsed from uploaded intake document.\n\n${rawText.slice(0, 1200)}` : "",
  }

  const signals: ParsedSignal[] = [
    { label: "Patient Name", value: [stage.first_name, stage.last_name].filter(Boolean).join(" "), confidence: patientName ? "high" : "low" },
    { label: "DOB", value: stage.dob, confidence: stage.dob ? "high" : "low" },
    { label: "MRN", value: stage.mrn, confidence: stage.mrn ? "medium" : "low" },
    { label: "Order Type", value: stage.order_type, confidence: stage.order_type ? "medium" : "low" },
    { label: "ICD-10", value: stage.icd10_codes, confidence: icd10.length ? "medium" : "low" },
    { label: "HCPCS", value: stage.hcpcs_codes, confidence: hcpcs.length ? "medium" : "low" },
    { label: "Provider NPI", value: stage.referring_npi, confidence: stage.referring_npi ? "medium" : "low" },
  ]

  return { stage, signals, rawText }
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  type?: string
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="font-raj text-[11px] uppercase tracking-[0.18em] text-[#7F8FA3]">
        {label}
        {required ? <span className="ml-1 text-[#EF5B5B]">*</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-[#203A5C] bg-[#07111F] px-3 py-2 text-sm text-[#C2CDD8] outline-none transition placeholder:text-[#536579] focus:border-[#2B6FD4]"
      />
    </label>
  )
}

export function IntakeDropzone({
  file,
  parsing,
  error,
  onFile,
}: {
  file: File | null
  parsing: boolean
  error: string | null
  onFile: (file: File) => void
}) {
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const next = event.dataTransfer.files?.[0]
        if (next) onFile(next)
      }}
      className="rounded-lg border border-dashed border-[#2B6FD4]/55 bg-[#2B6FD4]/[0.08] p-6"
    >
      <label className="flex cursor-pointer flex-col items-center justify-center gap-3 text-center">
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.tiff"
          className="hidden"
          onChange={(event) => {
            const next = event.target.files?.[0]
            if (next) onFile(next)
            event.target.value = ""
          }}
        />
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#2B6FD4]/40 bg-[#0B1829]">
          {parsing ? <Loader2 className="h-6 w-6 animate-spin text-[#2B6FD4]" /> : <UploadCloud className="h-6 w-6 text-[#2B6FD4]" />}
        </div>
        <div>
          <p className="font-raj text-lg uppercase tracking-[0.12em] text-[#C2CDD8]">Drop Intake Document</p>
          <p className="mt-1 text-xs text-[#7F8FA3]">PDF, fax image, clinical note, or patient sheet. Max parser limit follows the OCR proxy.</p>
        </div>
        {file ? <p className="rounded bg-[#07111F] px-3 py-1 text-xs text-[#C2CDD8]">{file.name}</p> : null}
      </label>
      {error ? (
        <div className="mt-4 flex gap-2 rounded-md border border-[#EF5B5B]/40 bg-[#EF5B5B]/10 p-3 text-xs text-[#F3B4B4]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  )
}

export function TridentParsedView({
  signals,
  rawText,
  parserSource,
}: {
  signals: ParsedSignal[]
  rawText: string
  parserSource: string
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#203A5C] bg-[#07111F] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-raj text-base uppercase tracking-[0.16em] text-[#C2CDD8]">Trident Extractor</p>
            <p className="text-xs text-[#7F8FA3]">{parserSource || "Awaiting document"}</p>
          </div>
          <FileSearch className="h-5 w-5 text-[#2B6FD4]" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {signals.map((signal) => (
            <div key={signal.label} className="rounded-md border border-[#203A5C]/70 bg-[#0B1829] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-[#7F8FA3]">{signal.label}</span>
                <span
                  className={
                    signal.confidence === "high"
                      ? "text-[10px] uppercase tracking-[0.14em] text-[#3BC27A]"
                      : signal.confidence === "medium"
                        ? "text-[10px] uppercase tracking-[0.14em] text-[#D9A441]"
                        : "text-[10px] uppercase tracking-[0.14em] text-[#EF5B5B]"
                  }
                >
                  {signal.confidence}
                </span>
              </div>
              <p className="mt-1 min-h-5 break-words text-sm text-[#C2CDD8]">{signal.value || "Operator required"}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-[#203A5C] bg-[#07111F] p-4">
        <p className="font-raj text-sm uppercase tracking-[0.16em] text-[#C2CDD8]">Document Text</p>
        <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-md bg-black/20 p-3 text-xs leading-relaxed text-[#C2CDD8]">
          {rawText || "No readable text extracted. Operator may continue with manual entry."}
        </pre>
      </div>
    </div>
  )
}

export default function IntakeQueueSurface() {
  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [stage, setStage] = useState<StagedIntake>(EMPTY_STAGE)
  const [signals, setSignals] = useState<ParsedSignal[]>([])
  const [rawText, setRawText] = useState("")
  const [parserSource, setParserSource] = useState("")
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<{ patientId: string; orderId: string; eligibility?: string } | null>(null)

  const setField = useCallback((field: keyof StagedIntake, value: string) => {
    setStage((prev) => ({ ...prev, [field]: value }))
  }, [])

  const icd10Codes = useMemo(() => stage.icd10_codes.split(/[,\s]+/).map((code) => code.trim().toUpperCase()).filter(Boolean), [stage.icd10_codes])
  const hcpcsCodes = useMemo(() => stage.hcpcs_codes.split(/[,\s]+/).map((code) => code.trim().toUpperCase()).filter(Boolean), [stage.hcpcs_codes])

  const parseFile = useCallback(async (nextFile: File) => {
    setFile(nextFile)
    setSubmitResult(null)
    setSubmitError(null)
    setParseError(null)
    setParserSource("Parsing document...")
    setParsing(true)
    if (fileUrl) URL.revokeObjectURL(fileUrl)
    setFileUrl(URL.createObjectURL(nextFile))

    try {
      const form = new FormData()
      form.append("file", nextFile)
      const res = await fetch("/api/fax/ocr", { method: "POST", body: form })
      const data = (await res.json().catch(() => ({}))) as OcrResult & { error?: string; detail?: string }
      if (!res.ok) throw new Error(data.detail || data.error || "Document parser rejected the upload.")

      let extractedText = data.rawText || data.raw_text_preview || ""
      if (!extractedText && data.source === "client" && nextFile.type.startsWith("image/")) {
        const { createWorker } = await import("tesseract.js")
        const worker = await createWorker("eng")
        const recognized = await worker.recognize(nextFile)
        extractedText = recognized.data.text || ""
        await worker.terminate()
      }

      const extracted = extractFromText(extractedText, data)
      setStage((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(extracted.stage).filter(([, value]) => String(value || "").trim())) }))
      setSignals(extracted.signals)
      setRawText(extracted.rawText)
      setParserSource(data.source === "server" ? "Server OCR / intake parser" : "Client extraction fallback")
      if (!extracted.rawText && data.source === "client") {
        setParseError("Server OCR is unavailable and this document did not yield client-readable text. Continue with manual override.")
      }
    } catch (error) {
      setSignals([])
      setRawText("")
      setParserSource("Manual override mode")
      setParseError(error instanceof Error ? error.message : "Unable to parse document. Continue with manual override.")
    } finally {
      setParsing(false)
    }
  }, [fileUrl])

  const uploadSourceDocument = useCallback(async (patientId: string, orderId: string) => {
    if (!file) return
    const form = new FormData()
    form.set("doc_type", "intake_source")
    form.set("file", file)
    const res = await fetch(`/api/patients/${patientId}/orders/${orderId}/documents`, {
      method: "POST",
      body: form,
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { detail?: string; error?: string }
      throw new Error(data.detail || data.error || "Source document upload failed after order creation.")
    }
  }, [file])

  const submitVerified = useCallback(async () => {
    setSubmitError(null)
    setSubmitResult(null)
    if (!stage.first_name.trim() || !stage.last_name.trim() || !stage.dob.trim()) {
      setSubmitError("Patient first name, last name, and DOB are required before execution.")
      return
    }
    if (!stage.payer_id.trim() || !stage.insurance_id.trim()) {
      setSubmitError("Payer and member ID are required before eligibility can be triggered.")
      return
    }

    setSubmitting(true)
    let patientId = ""
    try {
      const patientRes = await fetch("/api/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `spear-intake-patient-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          first_name: stage.first_name.trim(),
          last_name: stage.last_name.trim(),
          dob: stage.dob.trim(),
          email: stage.email.trim() || undefined,
          phone: stage.phone.trim() || undefined,
          insurance_id: stage.insurance_id.trim(),
          payer_id: stage.payer_id.trim(),
          diagnosis_codes: icd10Codes,
          address: { mrn: stage.mrn.trim() || null },
        }),
      })
      const patientJson = (await patientRes.json().catch(() => ({}))) as { patient_id?: string; detail?: string; error?: string }
      if (!patientRes.ok && patientRes.status !== 409) {
        throw new Error(patientJson.detail || patientJson.error || "Patient creation failed.")
      }
      patientId = patientJson.patient_id || ""
      if (!patientId) throw new Error("Patient ID was not returned by Core.")

      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `spear-intake-order-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          patient_id: patientId,
          hcpcs_codes: hcpcsCodes,
          referring_physician_npi: stage.referring_npi.trim() || undefined,
          payer_id: stage.payer_id.trim(),
          notes: stage.notes.trim() || undefined,
          priority: stage.priority,
          source_channel: "spear_intake",
          source_reference: file?.name || "manual-intake",
          vertical: "dme",
          product_category: stage.order_type.trim() || "intake-document",
          source: "document",
          intake_payload: {
            parser: {
              source: parserSource,
              signals,
              raw_text_preview: rawText.slice(0, 2000),
            },
            patient_input: {
              first_name: stage.first_name,
              last_name: stage.last_name,
              dob: stage.dob,
              mrn: stage.mrn,
            },
            coding: { icd10_codes: icd10Codes, hcpcs_codes: hcpcsCodes, order_type: stage.order_type },
            provider: { name: stage.provider_name, npi: stage.referring_npi },
          },
        }),
      })
      const orderJson = (await orderRes.json().catch(() => ({}))) as { order_id?: string; detail?: string; error?: string }
      if (!orderRes.ok || !orderJson.order_id) {
        throw new Error(orderJson.detail || orderJson.error || "Order creation failed.")
      }

      await uploadSourceDocument(patientId, orderJson.order_id)

      const workflowRes = await fetch(`/api/workflow/orders/${orderJson.order_id}/advance-from-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_request_swo: false }),
      })
      const workflowJson = (await workflowRes.json().catch(() => ({}))) as { next_step?: string; detail?: string; error?: string }
      setSubmitResult({
        patientId,
        orderId: orderJson.order_id,
        eligibility: workflowRes.ok ? workflowJson.next_step || "eligibility workflow triggered" : workflowJson.detail || workflowJson.error || "eligibility handoff requires review",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Intake execution failed."
      setSubmitError(patientId ? `${message} Patient was created (${patientId.slice(0, 8)}).` : message)
    } finally {
      setSubmitting(false)
    }
  }, [file?.name, hcpcsCodes, icd10Codes, parserSource, rawText, signals, stage, uploadSourceDocument])

  return (
    <div className="min-h-screen bg-[#07111F] text-[#C2CDD8]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&display=swap'); .font-raj{font-family:'Rajdhani',ui-sans-serif,sans-serif;}`}</style>
      <header className="border-b border-[#203A5C] bg-[#0B1829] px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-raj text-xs uppercase tracking-[0.24em] text-[#2B6FD4]">Spear Intake Queue</p>
            <h1 className="font-raj text-3xl font-semibold uppercase tracking-[0.08em] text-[#C2CDD8]">Verify Intake</h1>
          </div>
          <Link href="/spear" className="rounded-md border border-[#203A5C] px-3 py-2 text-xs uppercase tracking-[0.16em] text-[#C2CDD8] transition hover:border-[#2B6FD4]">
            Command
          </Link>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-89px)] grid-cols-1 xl:grid-cols-[430px_1fr]">
        <section className="border-b border-[#203A5C] bg-[#0B1829] p-5 xl:border-b-0 xl:border-r">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#2B6FD4]/15">
              <ClipboardCheck className="h-5 w-5 text-[#2B6FD4]" />
            </div>
            <div>
              <p className="font-raj text-lg uppercase tracking-[0.12em]">Intake Valve</p>
              <p className="text-xs text-[#7F8FA3]">Queue documents, stage records, trigger eligibility.</p>
            </div>
          </div>

          <IntakeDropzone file={file} parsing={parsing} error={parseError} onFile={parseFile} />

          <div className="mt-5 rounded-lg border border-[#203A5C] bg-[#07111F] p-4">
            <p className="font-raj text-sm uppercase tracking-[0.16em] text-[#C2CDD8]">Document Viewer</p>
            <div className="mt-3 flex aspect-[8.5/11] items-center justify-center overflow-hidden rounded-md border border-[#203A5C] bg-black/20">
              {fileUrl && file?.type === "application/pdf" ? (
                <iframe src={fileUrl} title="Uploaded intake document" className="h-full w-full" />
              ) : fileUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl} alt="Uploaded intake document" className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="text-center text-xs text-[#7F8FA3]">
                  <FileText className="mx-auto mb-2 h-8 w-8 text-[#2B6FD4]" />
                  Awaiting source document
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 p-5 2xl:grid-cols-[1fr_460px]">
          <div className="space-y-5">
            <div className="rounded-lg border border-[#203A5C] bg-[#0B1829] p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-raj text-xl uppercase tracking-[0.12em] text-[#C2CDD8]">Staged PatientIntakeForm</p>
                  <p className="text-xs text-[#7F8FA3]">Trident suggestions are editable. Operator verification remains required.</p>
                </div>
                <ShieldCheck className="h-5 w-5 text-[#2B6FD4]" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="First Name" required value={stage.first_name} onChange={(value) => setField("first_name", value)} />
                <Field label="Last Name" required value={stage.last_name} onChange={(value) => setField("last_name", value)} />
                <Field label="DOB" required type="date" value={stage.dob} onChange={(value) => setField("dob", value)} />
                <Field label="MRN" value={stage.mrn} onChange={(value) => setField("mrn", value)} />
                <Field label="Payer" required value={stage.payer_id} onChange={(value) => setField("payer_id", value)} placeholder="UHC, AETNA, MEDICARE_DMERC" />
                <Field label="Member ID" required value={stage.insurance_id} onChange={(value) => setField("insurance_id", value)} />
                <Field label="ICD-10" value={stage.icd10_codes} onChange={(value) => setField("icd10_codes", value)} placeholder="M17.11, R26.89" />
                <Field label="HCPCS" value={stage.hcpcs_codes} onChange={(value) => setField("hcpcs_codes", value)} placeholder="L1833, K0823" />
                <Field label="Order Type" value={stage.order_type} onChange={(value) => setField("order_type", value)} />
                <Field label="Provider NPI" value={stage.referring_npi} onChange={(value) => setField("referring_npi", value)} />
                <Field label="Provider Name" value={stage.provider_name} onChange={(value) => setField("provider_name", value)} />
                <label className="block">
                  <span className="font-raj text-[11px] uppercase tracking-[0.18em] text-[#7F8FA3]">Priority</span>
                  <select
                    value={stage.priority}
                    onChange={(event) => setStage((prev) => ({ ...prev, priority: event.target.value as Priority }))}
                    className="mt-1 w-full rounded-md border border-[#203A5C] bg-[#07111F] px-3 py-2 text-sm text-[#C2CDD8] outline-none focus:border-[#2B6FD4]"
                  >
                    <option value="standard">Standard</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">Stat</option>
                  </select>
                </label>
              </div>

              <label className="mt-4 block">
                <span className="font-raj text-[11px] uppercase tracking-[0.18em] text-[#7F8FA3]">Operator Notes</span>
                <textarea
                  value={stage.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                  rows={6}
                  className="mt-1 w-full rounded-md border border-[#203A5C] bg-[#07111F] px-3 py-2 text-sm text-[#C2CDD8] outline-none focus:border-[#2B6FD4]"
                />
              </label>

              {submitError ? (
                <div className="mt-4 rounded-md border border-[#EF5B5B]/40 bg-[#EF5B5B]/10 p-3 text-sm text-[#F3B4B4]">{submitError}</div>
              ) : null}
              {submitResult ? (
                <div className="mt-4 rounded-md border border-[#3BC27A]/40 bg-[#3BC27A]/10 p-3 text-sm text-[#BDF4D3]">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    Intake executed
                  </div>
                  <p className="mt-1">Patient {submitResult.patientId.slice(0, 8)} / Order {submitResult.orderId.slice(0, 8)}. {submitResult.eligibility}</p>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={submitVerified}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-[#2B6FD4] px-4 py-2 font-raj text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#3B7FE4] disabled:cursor-wait disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Execute Intake
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStage(EMPTY_STAGE)
                    setSignals([])
                    setRawText("")
                    setSubmitResult(null)
                    setSubmitError(null)
                  }}
                  className="rounded-md border border-[#203A5C] px-4 py-2 font-raj text-sm font-semibold uppercase tracking-[0.12em] text-[#C2CDD8] transition hover:border-[#2B6FD4]"
                >
                  Clear Stage
                </button>
              </div>
            </div>
          </div>

          <aside>
            <TridentParsedView signals={signals} rawText={rawText} parserSource={parserSource} />
            <div className="mt-5 rounded-lg border border-[#203A5C] bg-[#0B1829] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Database className="h-4 w-4 text-[#2B6FD4]" />
                <p className="font-raj text-sm uppercase tracking-[0.16em]">Workflow Handoff</p>
              </div>
              <ol className="space-y-2 text-xs text-[#7F8FA3]">
                <li>1. Create or match patient in Poseidon Core.</li>
                <li>2. Create draft intake order with extracted coding context.</li>
                <li>3. Attach source document to the order record.</li>
                <li>4. Trigger Core intake advancement for eligibility verification.</li>
              </ol>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}
