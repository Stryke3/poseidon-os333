"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
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
  laterality: string
  facility_name: string
  facility_id: string
  provider_id: string
  referring_npi: string
  provider_name: string
  notes: string
  priority: Priority
}

type StagedTextField = Exclude<keyof StagedIntake, "priority">

type ParsedSignal = {
  field: string
  label: string
  value: string
  confidence: number
  source_page: number | null
  source_text: string
  method: "pdf_text" | "ocr" | "operator"
  status?: "Extracted" | "Needs Review" | "Missing" | "Operator Corrected"
}

type PageExtraction = {
  page: number
  type: "text" | "image" | "mixed"
  text_length: number
  ocr_required: boolean
  ocr_attempted: boolean
  ocr_status: "not_required" | "completed" | "failed" | "blocked"
  classifications: string[]
}

type ExtractionResponse = {
  ok?: boolean
  document?: {
    document_id: string
    filename: string
    page_count: number
    mime_type: string
    storage_status: string
    extraction_status: string
  }
  extraction?: {
    page_count: number
    extraction_status: string
    progress: string[]
    pages: PageExtraction[]
    fields: ParsedSignal[]
    combined_text: string
    warnings: string[]
  }
  error?: string
  code?: string
  next_action?: string
}

type PatientMatch = Record<string, unknown>
type MatchDecision = "" | "existing" | "new" | "duplicate_review"

type LegacyOcrResult = {
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
  laterality: "",
  facility_name: "",
  facility_id: "",
  provider_id: "",
  referring_npi: "",
  provider_name: "",
  notes: "",
  priority: "standard",
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

function display(value: unknown, fallback = "Not captured") {
  if (value === null || value === undefined || value === "") return fallback
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback
  return String(value)
}

function norm(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")
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

function extractFromText(raw: string, result?: LegacyOcrResult): { stage: StagedIntake; signals: ParsedSignal[]; rawText: string } {
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
    { field: "patient_name", label: "Patient Name", value: [stage.first_name, stage.last_name].filter(Boolean).join(" "), confidence: patientName ? 0.9 : 0, source_page: null, source_text: "", method: "pdf_text" },
    { field: "dob", label: "DOB", value: stage.dob, confidence: stage.dob ? 0.9 : 0, source_page: null, source_text: "", method: "pdf_text" },
    { field: "mrn", label: "MRN", value: stage.mrn, confidence: stage.mrn ? 0.78 : 0, source_page: null, source_text: "", method: "pdf_text" },
    { field: "order_type", label: "Order Type", value: stage.order_type, confidence: stage.order_type ? 0.78 : 0, source_page: null, source_text: "", method: "pdf_text" },
    { field: "icd10", label: "ICD-10", value: stage.icd10_codes, confidence: icd10.length ? 0.78 : 0, source_page: null, source_text: "", method: "pdf_text" },
    { field: "hcpcs", label: "HCPCS", value: stage.hcpcs_codes, confidence: hcpcs.length ? 0.78 : 0, source_page: null, source_text: "", method: "pdf_text" },
    { field: "provider_npi", label: "Provider NPI", value: stage.referring_npi, confidence: stage.referring_npi ? 0.78 : 0, source_page: null, source_text: "", method: "pdf_text" },
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
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", marginBottom: "4px" }}>
        {label}
        {required ? <span style={{ marginLeft: "4px", color: "#DC2626" }}>*</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "8px 10px",
          border: "1px solid #E5E7EB",
          borderRadius: "6px",
          fontSize: "13px",
          color: "#0F172A",
          background: "#FFFFFF",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </label>
  )
}

function ParsedFieldsView({
  signals,
  rawText,
  parserSource,
  pages,
  progress,
  warnings,
  onViewPage,
}: {
  signals: ParsedSignal[]
  rawText: string
  parserSource: string
  pages: PageExtraction[]
  progress: string[]
  warnings: string[]
  onViewPage: (page: number) => void
}) {
  const confidenceLabel = (signal: ParsedSignal, hasValue: boolean) => {
    if (signal.field === "hcpcs" && !hasValue) return "Assigned by Trident"
    if (!hasValue) return "Missing"
    if (signal.confidence >= 0.9) return "High"
    if (signal.confidence >= 0.7) return "Review"
    return "Low"
  }
  const confidenceColor = (confidence: number, hasValue: boolean) => {
    if (!hasValue) return "#6B7280"
    if (confidence >= 0.9) return "#16A34A"
    if (confidence >= 0.7) return "#D97706"
    return "#DC2626"
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ border: "1px solid #E5E7EB", borderRadius: "8px", padding: "16px", background: "#FFFFFF" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A", margin: 0 }}>Parsed Fields</p>
            <p style={{ fontSize: "11px", color: "#6B7280", margin: "2px 0 0" }}>{parserSource || "Awaiting document"}</p>
          </div>
        </div>
        {progress.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
            {progress.map((step) => (
              <span key={step} style={{ fontSize: "10px", color: "#475569", background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: "999px", padding: "3px 8px" }}>{step}</span>
            ))}
          </div>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          {signals.map((signal) => (
            <div key={signal.label} style={{ border: "1px solid #E5E7EB", borderRadius: "6px", padding: "10px", background: "#F9FAFB" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280" }}>{signal.label}</span>
                <span style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: confidenceColor(signal.confidence, Boolean(signal.value)),
                }}>
                  {confidenceLabel(signal, Boolean(signal.value))}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "12px", color: "#0F172A", wordBreak: "break-word", minHeight: "16px" }}>
                {signal.value || <span style={{ color: "#9CA3AF" }}>Missing</span>}
              </p>
              <div style={{ marginTop: "8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ fontSize: "10px", color: "#64748B" }}>{signal.source_page ? `Page ${signal.source_page} · ${signal.method}` : "No source page"}</span>
                {signal.source_page ? (
                  <button type="button" onClick={() => onViewPage(signal.source_page || 1)} style={{ border: "none", background: "transparent", color: "#2563EB", fontSize: "10px", fontWeight: 700, cursor: "pointer", padding: 0 }}>
                    View source
                  </button>
                ) : null}
              </div>
              {signal.source_text ? <p style={{ margin: "6px 0 0", fontSize: "10px", color: "#64748B", lineHeight: 1.4 }}>{signal.source_text}</p> : null}
            </div>
          ))}
        </div>
        {warnings.length ? (
          <div style={{ marginTop: "12px", border: "1px solid #FED7AA", background: "#FFF7ED", borderRadius: "6px", padding: "10px", fontSize: "11px", color: "#9A3412" }}>
            {warnings.map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        ) : null}
      </div>
      <div style={{ border: "1px solid #E5E7EB", borderRadius: "8px", padding: "16px", background: "#FFFFFF" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A", margin: "0 0 10px" }}>Page Classification</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {pages.length ? pages.map((page) => (
            <button key={page.page} type="button" onClick={() => onViewPage(page.page)} style={{ textAlign: "left", border: "1px solid #E5E7EB", borderRadius: "6px", background: "#F9FAFB", padding: "8px", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <strong style={{ fontSize: "12px", color: "#0F172A" }}>Page {page.page}</strong>
                <span style={{ fontSize: "10px", color: page.ocr_status === "completed" ? "#16A34A" : page.ocr_required ? "#D97706" : "#64748B" }}>{page.type} · OCR {page.ocr_status.replace("_", " ")}</span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#64748B" }}>{page.classifications.join(", ")} · {page.text_length} chars</p>
            </button>
          )) : <p style={{ margin: 0, fontSize: "12px", color: "#9CA3AF" }}>Upload a document to classify pages.</p>}
        </div>
      </div>
      <div style={{ border: "1px solid #E5E7EB", borderRadius: "8px", padding: "16px", background: "#FFFFFF" }}>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A", margin: "0 0 10px" }}>Document Text</p>
        <pre style={{
          margin: 0,
          maxHeight: "280px",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          fontSize: "11px",
          lineHeight: 1.6,
          color: "#374151",
          background: "#F9FAFB",
          borderRadius: "6px",
          padding: "10px",
          border: "1px solid #E5E7EB",
        }}>
          {rawText || "No readable text extracted yet. Retry extraction or choose explicit manual entry if automated extraction fails."}
        </pre>
      </div>
    </div>
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
      style={{
        border: "2px dashed #D1D5DB",
        borderRadius: "8px",
        background: "#F9FAFB",
        padding: "24px",
      }}
    >
      <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", textAlign: "center", cursor: "pointer" }}>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.tiff"
          style={{ display: "none" }}
          onChange={(event) => {
            const next = event.target.files?.[0]
            if (next) onFile(next)
            event.target.value = ""
          }}
        />
        <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {parsing
            ? <Loader2 style={{ width: "22px", height: "22px", color: "#2563EB", animation: "spin 1s linear infinite" }} />
            : <UploadCloud style={{ width: "22px", height: "22px", color: "#6B7280" }} />
          }
        </div>
        <div>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "#0F172A", margin: 0 }}>Drop Intake Document</p>
          <p style={{ fontSize: "12px", color: "#6B7280", margin: "4px 0 0" }}>PDF, fax image, clinical note, or patient sheet</p>
        </div>
        {file ? (
          <span style={{ fontSize: "12px", color: "#374151", background: "#E5E7EB", padding: "4px 10px", borderRadius: "4px" }}>{file.name}</span>
        ) : null}
      </label>
      {error ? (
        <div style={{ marginTop: "12px", display: "flex", gap: "8px", border: "1px solid #FECACA", background: "#FEF2F2", borderRadius: "6px", padding: "10px 12px", fontSize: "12px", color: "#DC2626" }}>
          <AlertTriangle style={{ width: "14px", height: "14px", flexShrink: 0, marginTop: "1px" }} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  )
}

export default function IntakeQueueSurface() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [stage, setStage] = useState<StagedIntake>(EMPTY_STAGE)
  const [signals, setSignals] = useState<ParsedSignal[]>([])
  const [rawText, setRawText] = useState("")
  const [parserSource, setParserSource] = useState("")
  const [documentId, setDocumentId] = useState("")
  const [pages, setPages] = useState<PageExtraction[]>([])
  const [progress, setProgress] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [selectedPage, setSelectedPage] = useState(1)
  const [manualMode, setManualMode] = useState(false)
  const [operatorCorrections, setOperatorCorrections] = useState<Record<string, boolean>>({})
  const [manualReason, setManualReason] = useState("")
  const [patientMatches, setPatientMatches] = useState<PatientMatch[]>([])
  const [matchDecision, setMatchDecision] = useState<MatchDecision>("")
  const [selectedMatchId, setSelectedMatchId] = useState("")
  const [masterData, setMasterData] = useState<Record<string, Array<Record<string, unknown>>>>({ payers: [], providers: [], facilities: [], carepaths: [], kits: [], code_sets: [] })
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<{ caseId: string; orderId: string; status?: string } | null>(null)

  const setField = useCallback((field: keyof StagedIntake, value: string) => {
    setOperatorCorrections((prev) => ({ ...prev, [field]: true }))
    setStage((prev) => ({ ...prev, [field]: value }))
  }, [])

  const icd10Codes = useMemo(() => stage.icd10_codes.split(/[,\s]+/).map((code) => code.trim().toUpperCase()).filter(Boolean), [stage.icd10_codes])
  const hcpcsCodes = useMemo(() => stage.hcpcs_codes.split(/[,\s]+/).map((code) => code.trim().toUpperCase()).filter(Boolean), [stage.hcpcs_codes])
  const activePayers = useMemo(() => (masterData.payers || []).filter((row) => row.active !== false), [masterData])
  const activeFacilities = useMemo(() => (masterData.facilities || []).filter((row) => row.active !== false), [masterData])
  const activeProviders = useMemo(() => {
    const providers = (masterData.providers || []).filter((row) => row.active !== false)
    if (!stage.facility_id) return providers
    return providers.filter((row) => Array.isArray(row.facilities) && row.facilities.map(String).includes(stage.facility_id))
  }, [masterData, stage.facility_id])

  const requiredMissing = useMemo(() => {
    const missing: string[] = []
    if (!stage.first_name.trim() || !stage.last_name.trim()) missing.push("patient name")
    if (!stage.dob.trim()) missing.push("DOB")
    if (!stage.payer_id.trim()) missing.push("payer")
    if (!stage.insurance_id.trim()) missing.push("member ID")
    if (!stage.provider_name.trim() && !stage.facility_name.trim()) missing.push("provider or facility")
    if (!stage.order_type.trim() && !stage.icd10_codes.trim()) missing.push("order context")
    if (!matchDecision) missing.push("patient match confirmation")
    if (matchDecision === "existing" && !selectedMatchId) missing.push("selected existing patient")
    return missing
  }, [matchDecision, selectedMatchId, stage])

  useEffect(() => {
    fetch("/api/spear/master-data", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setMasterData(data?.master_data || {}))
      .catch(() => setMasterData({ payers: [], providers: [], facilities: [], carepaths: [], kits: [], code_sets: [] }))
  }, [])

  useEffect(() => {
    if (!activeFacilities.length && !activePayers.length) return
    setStage((prev) => {
      let next = prev
      if (prev.payer_id && activePayers.length) {
        const raw = norm(prev.payer_id)
        const payer = activePayers.find((item) => norm(item.display_name || item.canonical_name) === raw || (Array.isArray(item.aliases) && item.aliases.some((alias) => norm(alias) === raw)))
        if (payer && prev.payer_id !== String(payer.display_name || payer.canonical_name || "")) {
          next = { ...next, payer_id: String(payer.display_name || payer.canonical_name || "") }
        }
      }
      if (prev.facility_name && !prev.facility_id && activeFacilities.length) {
        const raw = norm(prev.facility_name)
        const facility = activeFacilities.find((item) => norm(item.canonical_name) === raw || (Array.isArray(item.aliases) && item.aliases.some((alias) => norm(alias) === raw)))
        if (facility) {
          const defaultProviderId = String(facility.default_provider_id || "")
          const provider = defaultProviderId ? (masterData.providers || []).find((item) => String(item.id) === defaultProviderId) : null
          next = {
            ...next,
            facility_id: String(facility.id || ""),
            facility_name: String(facility.canonical_name || prev.facility_name),
            provider_id: provider ? String(provider.id) : next.provider_id,
            provider_name: provider ? String(provider.display_name || "") : next.provider_name,
            referring_npi: provider ? String(provider.npi || "") : next.referring_npi,
          }
        }
      }
      return next
    })
  }, [activeFacilities, activePayers, masterData.providers, stage.facility_name, stage.payer_id])

  const refreshPatientMatches = useCallback(async (nextStage: Partial<StagedIntake>) => {
    const patient = [nextStage.first_name, nextStage.last_name].filter(Boolean).join(" ").toLowerCase()
    const dob = String(nextStage.dob || "")
    const mrn = String(nextStage.mrn || "").toLowerCase()
    const member = String(nextStage.insurance_id || "").toLowerCase()
    const payer = String(nextStage.payer_id || "").toLowerCase()
    if (!patient && !dob && !mrn && !member) {
      setPatientMatches([])
      setMatchDecision("")
      setSelectedMatchId("")
      return
    }
    try {
      const res = await fetch("/api/spear/cases", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      const records = Array.isArray(data) ? data : Array.isArray(data.cases) ? data.cases : []
      const matches = records
        .map((record: PatientMatch) => {
          let score = 0
          const recordName = String(record.patient_name || record.patient || "").toLowerCase()
          const recordDob = String(record.dob || "")
          const recordMrn = String(record.mrn || "").toLowerCase()
          const recordMember = String(record.member_id || "").toLowerCase()
          const recordPayer = String(record.payer || "").toLowerCase()
          if (patient && recordName === patient) score += 4
          else if (patient && recordName.includes(patient.split(" ").filter(Boolean).slice(-1)[0] || "__never__")) score += 1
          if (dob && recordDob === dob) score += 4
          if (mrn && recordMrn && recordMrn === mrn) score += 5
          if (member && recordMember && recordMember === member) score += 5
          if (payer && recordPayer && (recordPayer === payer || recordPayer.includes(payer.replace(/_/g, " ")))) score += 1
          return { record, score }
        })
        .filter((item: { score: number }) => item.score >= 4)
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
        .slice(0, 5)
        .map((item: { record: PatientMatch }) => item.record)
      setPatientMatches(matches)
      setMatchDecision(matches.length ? "" : "new")
      setSelectedMatchId("")
    } catch {
      setPatientMatches([])
      setMatchDecision("")
      setSelectedMatchId("")
    }
  }, [])

  const applyExtraction = useCallback((fields: ParsedSignal[], combinedText: string) => {
    const byField = Object.fromEntries(fields.map((item) => [item.field, item.value]))
    const patient = String(byField.patient_name || "")
    const split = splitName(patient)
    const next: Partial<StagedIntake> = {
      first_name: String(byField.first_name || split.first_name || ""),
      last_name: String(byField.last_name || split.last_name || ""),
      dob: normalizeDob(String(byField.dob || "")),
      mrn: String(byField.mrn || ""),
      phone: String(byField.phone || ""),
      email: String(byField.email || ""),
      payer_id: String(byField.payer || "").toUpperCase().replace(/\s+/g, "_"),
      insurance_id: String(byField.member_id || ""),
      icd10_codes: String(byField.icd10 || ""),
      hcpcs_codes: String(byField.hcpcs || ""),
      order_type: String(byField.order_type || byField.product || ""),
      laterality: String(byField.laterality || ""),
      facility_name: String(byField.facility_name || ""),
      referring_npi: String(byField.provider_npi || ""),
      provider_name: String(byField.provider_name || ""),
      notes: combinedText ? `Parsed from uploaded intake document.\n\n${combinedText.slice(0, 1200)}` : "",
    }
    let mergedStage: StagedIntake | null = null
    setStage((prev) => {
      const merged = { ...prev }
      for (const [key, value] of Object.entries(next) as Array<[StagedTextField, string]>) {
        if (!operatorCorrections[key] && value.trim()) merged[key] = value
      }
      mergedStage = merged
      return merged
    })
    setMatchDecision("")
    setSelectedMatchId("")
    setTimeout(() => refreshPatientMatches(mergedStage || next), 0)
  }, [operatorCorrections, refreshPatientMatches])

  const parseFile = useCallback(async (nextFile: File) => {
    setFile(nextFile)
    setSubmitResult(null)
    setSubmitError(null)
    setParseError(null)
    setParserSource("Inspecting document...")
    setDocumentId("")
    setPages([])
    setProgress(["Inspecting document"])
    setWarnings([])
    setManualMode(false)
    setPatientMatches([])
    setMatchDecision("")
    setSelectedMatchId("")
    setParsing(true)
    if (fileUrl) URL.revokeObjectURL(fileUrl)
    setFileUrl(URL.createObjectURL(nextFile))

    try {
      const form = new FormData()
      form.append("file", nextFile)
      const res = await fetch("/api/spear/intake/extract", { method: "POST", body: form })
      const data = (await res.json().catch(() => ({}))) as ExtractionResponse
      if (!res.ok || !data.ok) throw new Error(data.next_action ? `${data.error || "Extraction failed"} ${data.next_action}` : data.error || "Document parser rejected the upload.")

      setDocumentId(data.document?.document_id || "")
      setSignals(data.extraction?.fields || [])
      setRawText(data.extraction?.combined_text || "")
      setPages(data.extraction?.pages || [])
      setProgress(data.extraction?.progress || [])
      setWarnings(data.extraction?.warnings || [])
      setParserSource(`${data.document?.storage_status || "stored"} · ${data.document?.extraction_status || "review required"} · ${data.document?.page_count || 0} pages`)
      applyExtraction(data.extraction?.fields || [], data.extraction?.combined_text || "")
      if (data.document?.extraction_status === "manual_exception_available" || data.document?.extraction_status === "failed") {
        setParseError("Automated extraction did not complete. Retry extraction or choose explicit manual entry.")
      }
    } catch (error) {
      setSignals([])
      setRawText("")
      setPages([])
      setProgress(["Upload failed", "Retry available"])
      setParserSource("Extraction incomplete")
      setParseError(error instanceof Error ? error.message : "Document extraction failed. Retry extraction or choose manual entry.")
    } finally {
      setParsing(false)
    }
  }, [applyExtraction, fileUrl])

  const submitVerified = useCallback(async () => {
    setSubmitError(null)
    setSubmitResult(null)
    if (requiredMissing.length && !manualMode) {
      setSubmitError(`Required fields missing: ${requiredMissing.join(", ")}. Correct the staged record before Execute Intake.`)
      return
    }
    if (requiredMissing.length && manualMode && !manualReason.trim()) {
      setSubmitError("Manual exception requires an operator reason before Execute Intake.")
      return
    }
    if (file && !documentId) {
      setSubmitError("Source document has not been stored yet. Retry extraction before Execute Intake.")
      return
    }

    setSubmitting(true)
    try {
      const payload = {
          patient_name: [stage.first_name.trim(), stage.last_name.trim()].filter(Boolean).join(" "),
          dob: stage.dob.trim(),
          member_id: stage.insurance_id.trim(),
          payer_id: stage.payer_id.trim(),
          payer: stage.payer_id.trim(),
          raw_payer: stage.payer_id.trim(),
          facility_name_raw: stage.facility_name.trim(),
          facility_id: stage.facility_id.trim(),
          provider_id: stage.provider_id.trim(),
          provider: stage.provider_name.trim(),
          provider_name_raw: stage.provider_name.trim(),
          npi: stage.referring_npi.trim(),
          source_hcpcs: hcpcsCodes,
          source_icd: icd10Codes,
          hcpcs: [],
          icd: icd10Codes,
          hcpcs_status: "pending_trident",
          coding_status: "pending_trident",
          product: stage.order_type.trim(),
          laterality: stage.laterality.trim(),
          order_date: new Date().toISOString().slice(0, 10),
          priority: stage.priority,
          source: "spear_intake",
          parser_source: parserSource,
          raw_text: rawText.slice(0, 2000),
          notes: stage.notes.trim(),
          source_document: file?.name,
          source_document_id: documentId,
          extraction_result: {
            progress,
            pages,
            fields: signals,
            warnings,
          },
          reviewed_fields: signals.map((signal) => ({
            field: signal.field,
            value: signal.value,
            confidence: signal.confidence,
            source_page: signal.source_page,
            method: signal.method,
          })),
          operator_corrections: Object.keys(operatorCorrections).filter((key) => operatorCorrections[key]),
          patient_match_decision: matchDecision,
          matched_case_id: selectedMatchId || undefined,
          override_reason: manualMode ? manualReason.trim() : undefined,
          operator_identity: "spear_operator",
        }
      const body = new FormData()
      body.set("payload", JSON.stringify(payload))
      if (file) body.set("file", file)
      const intakeRes = await fetch("/api/spear/intake", {
        method: "POST",
        body,
      })
      const intakeJson = (await intakeRes.json().catch(() => ({}))) as { case_id?: string; order_id?: string; status?: string; destination?: string; detail?: string; error?: string; missing_fields?: string[] }
      if (!intakeRes.ok || !intakeJson.case_id || !intakeJson.order_id) {
        const missing = intakeJson.missing_fields?.length ? ` Missing: ${intakeJson.missing_fields.join(", ")}.` : ""
        throw new Error(`${intakeJson.detail || intakeJson.error || "SPEAR intake creation failed."}${missing}`)
      }
      setSubmitResult({
        caseId: intakeJson.case_id,
        orderId: intakeJson.order_id,
        status: intakeJson.status,
      })
      router.push(intakeJson.destination || `/spear/cases/${intakeJson.case_id}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Intake execution failed."
      setSubmitError(message)
    } finally {
      setSubmitting(false)
    }
  }, [documentId, file, hcpcsCodes, icd10Codes, manualMode, manualReason, matchDecision, operatorCorrections, pages, parserSource, progress, rawText, requiredMissing, router, selectedMatchId, signals, stage, warnings])

  return (
    <div style={{ minHeight: "100%", background: "#F9FAFB" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid #E5E7EB", background: "#FFFFFF", padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B7280", margin: 0 }}>Spear Intake</p>
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#0F172A", margin: "2px 0 0" }}>Document Queue</h1>
          </div>
          <Link
            href="/spear"
            style={{
              fontSize: "12px",
              color: "#374151",
              border: "1px solid #E5E7EB",
              borderRadius: "6px",
              padding: "6px 12px",
              textDecoration: "none",
              background: "#FFFFFF",
            }}
          >
            ← Command
          </Link>
        </div>
      </header>

      {/* Two-column layout */}
      <main style={{ display: "grid", gridTemplateColumns: "400px 1fr", minHeight: "calc(100vh - 89px)" }}>
        {/* Left — Dropzone + document viewer */}
        <section style={{ borderRight: "1px solid #E5E7EB", background: "#FFFFFF", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ClipboardCheck style={{ width: "18px", height: "18px", color: "#6B7280" }} />
            </div>
            <div>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A", margin: 0 }}>Document Queue</p>
              <p style={{ fontSize: "11px", color: "#6B7280", margin: 0 }}>Queue documents, stage records, trigger eligibility.</p>
            </div>
          </div>

          <IntakeDropzone file={file} parsing={parsing} error={parseError} onFile={parseFile} />
          {file ? (
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => parseFile(file)}
                disabled={parsing}
                style={{ flex: 1, border: "1px solid #CBD5E1", background: "#FFFFFF", color: "#0F172A", borderRadius: "6px", padding: "8px 10px", fontSize: "12px", fontWeight: 700, cursor: parsing ? "wait" : "pointer" }}
              >
                Retry Extraction
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualMode(true)
                  setParseError("Automated extraction was unsuccessful. Values entered manually will be recorded as operator-verified.")
                }}
                style={{ flex: 1, border: "1px solid #FED7AA", background: "#FFF7ED", color: "#9A3412", borderRadius: "6px", padding: "8px 10px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
              >
                Enter Manually
              </button>
            </div>
          ) : null}

          <div style={{ border: "1px solid #E5E7EB", borderRadius: "8px", padding: "12px", background: "#F9FAFB" }}>
            <p style={{ fontSize: "12px", fontWeight: 600, color: "#374151", margin: "0 0 8px" }}>Document Viewer {file ? `· Page ${selectedPage}` : ""}</p>
            <div style={{ aspectRatio: "8.5 / 11", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: "6px", border: "1px solid #E5E7EB", background: "#FFFFFF" }}>
              {fileUrl && file?.type === "application/pdf" ? (
                <iframe src={`${fileUrl}#page=${selectedPage}`} title="Uploaded intake document" style={{ width: "100%", height: "100%", border: "none" }} />
              ) : fileUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl} alt="Uploaded intake document" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              ) : (
                <div style={{ textAlign: "center", padding: "24px" }}>
                  <FileText style={{ width: "32px", height: "32px", color: "#D1D5DB", margin: "0 auto 8px" }} />
                  <p style={{ fontSize: "12px", color: "#9CA3AF", margin: 0 }}>Awaiting source document</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right — Form + Parsed fields */}
        <section style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 420px", gap: "20px", alignContent: "start" }}>
          {/* Form */}
          <div style={{ border: "1px solid #E5E7EB", borderRadius: "8px", background: "#FFFFFF", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
              <div>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "#0F172A", margin: 0 }}>Staged Patient Record</p>
                <p style={{ fontSize: "11px", color: "#6B7280", margin: "2px 0 0" }}>Suggestions are editable. Operator verification required.</p>
              </div>
              <ShieldCheck style={{ width: "18px", height: "18px", color: "#6B7280", flexShrink: 0 }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Field label="First Name" required value={stage.first_name} onChange={(value) => setField("first_name", value)} />
              <Field label="Last Name" required value={stage.last_name} onChange={(value) => setField("last_name", value)} />
              <Field label="DOB" required type="date" value={stage.dob} onChange={(value) => setField("dob", value)} />
              <Field label="MRN" value={stage.mrn} onChange={(value) => setField("mrn", value)} />
              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", marginBottom: "4px" }}>Payer <span style={{ marginLeft: "4px", color: "#DC2626" }}>*</span></span>
                <select
                  value={stage.payer_id}
                  onChange={(event) => setField("payer_id", event.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "6px", fontSize: "13px", color: "#0F172A", background: "#FFFFFF", outline: "none" }}
                >
                  <option value={stage.payer_id || ""}>{stage.payer_id || "Select payer"}</option>
                  {activePayers.map((payer) => (
                    <option key={String(payer.id)} value={String(payer.display_name || payer.canonical_name || payer.id)}>{String(payer.display_name || payer.canonical_name || payer.id)}</option>
                  ))}
                </select>
              </label>
              <Field label="Member ID" required value={stage.insurance_id} onChange={(value) => setField("insurance_id", value)} />
              <Field label="ICD-10" value={stage.icd10_codes} onChange={(value) => setField("icd10_codes", value)} placeholder="M17.11, R26.89" />
              <Field label="HCPCS — Optional from source / assigned by Trident" value={stage.hcpcs_codes} onChange={(value) => setField("hcpcs_codes", value)} placeholder="Optional source code, if present" />
              <Field label="Order Type" value={stage.order_type} onChange={(value) => setField("order_type", value)} />
              <Field label="Laterality" value={stage.laterality} onChange={(value) => setField("laterality", value)} placeholder="Right, Left, Bilateral" />
              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", marginBottom: "4px" }}>Facility / Practice</span>
                <select
                  value={stage.facility_id}
                  onChange={(event) => {
                    const facility = activeFacilities.find((item) => String(item.id) === event.target.value)
                    const defaultProviderId = String(facility?.default_provider_id || "")
                    const provider = defaultProviderId ? (masterData.providers || []).find((item) => String(item.id) === defaultProviderId) : null
                    setStage((prev) => ({
                      ...prev,
                      facility_id: event.target.value,
                      facility_name: String(facility?.canonical_name || ""),
                      provider_id: provider ? String(provider.id) : prev.provider_id,
                      provider_name: provider ? String(provider.display_name || "") : prev.provider_name,
                      referring_npi: provider ? String(provider.npi || "") : prev.referring_npi,
                    }))
                  }}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "6px", fontSize: "13px", color: "#0F172A", background: "#FFFFFF", outline: "none" }}
                >
                  <option value="">{stage.facility_name || "Select facility"}</option>
                  {activeFacilities.map((facility) => (
                    <option key={String(facility.id)} value={String(facility.id)}>{String(facility.canonical_name || facility.id)}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", marginBottom: "4px" }}>Provider</span>
                <select
                  value={stage.provider_id}
                  onChange={(event) => {
                    const provider = (masterData.providers || []).find((item) => String(item.id) === event.target.value)
                    setStage((prev) => ({
                      ...prev,
                      provider_id: event.target.value,
                      provider_name: String(provider?.display_name || ""),
                      referring_npi: String(provider?.npi || ""),
                    }))
                  }}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "6px", fontSize: "13px", color: "#0F172A", background: "#FFFFFF", outline: "none" }}
                >
                  <option value="">{stage.provider_name || "Select provider"}</option>
                  {activeProviders.map((provider) => (
                    <option key={String(provider.id)} value={String(provider.id)}>{String(provider.display_name || provider.id)}{provider.npi ? ` · NPI ${provider.npi}` : " · NPI setup required"}</option>
                  ))}
                </select>
              </label>
              <Field label="Provider NPI — from registry" value={stage.referring_npi} onChange={(value) => setField("referring_npi", value)} placeholder="Auto-populates when provider has saved NPI" />
              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", marginBottom: "4px" }}>Priority</span>
                <select
                  value={stage.priority}
                  onChange={(event) => setStage((prev) => ({ ...prev, priority: event.target.value as Priority }))}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "6px", fontSize: "13px", color: "#0F172A", background: "#FFFFFF", outline: "none" }}
                >
                  <option value="standard">Standard</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">Stat</option>
                </select>
              </label>
            </div>

            <div style={{ marginTop: "12px", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "12px", background: "#F8FAFC" }}>
              <p style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: 700, color: "#0F172A" }}>Patient Match Review</p>
              <p style={{ margin: "0 0 10px", fontSize: "11px", color: "#64748B" }}>
                Confirm whether this intake belongs to an existing patient or creates a new patient record.
              </p>
              {patientMatches.length ? (
                <div style={{ display: "grid", gap: "8px", marginBottom: "10px" }}>
                  {patientMatches.map((match) => {
                    const id = String(match.id || match.case_id || "")
                    const selected = selectedMatchId === id
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setSelectedMatchId(id)
                          setMatchDecision("existing")
                        }}
                        style={{
                          textAlign: "left",
                          border: `1px solid ${selected ? "#2563EB" : "#CBD5E1"}`,
                          background: selected ? "#EFF6FF" : "#FFFFFF",
                          borderRadius: "8px",
                          padding: "10px",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: "13px", fontWeight: 800, color: "#0F172A" }}>{display((match as { patient_name?: unknown }).patient_name, "Missing patient")}</div>
                        <div style={{ marginTop: 4, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", fontSize: "11px", color: "#475569" }}>
                          <span>DOB: {display(match.dob, "Missing")}</span>
                          <span>MRN: {display(match.mrn, "Not captured")}</span>
                          <span>Payer: {display(match.payer, "Missing")}</span>
                          <span>Member ID: {display(match.member_id, "Missing")}</span>
                          <span>Provider: {display(match.provider, "Missing")}</span>
                          <span>Order: {display(match.product, display(match.hcpcs, "Missing"))}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#64748B" }}>No likely existing patient match found from name, DOB, MRN, payer, or member ID.</p>
              )}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" onClick={() => setMatchDecision("new")} style={{ border: `1px solid ${matchDecision === "new" ? "#2563EB" : "#CBD5E1"}`, background: matchDecision === "new" ? "#EFF6FF" : "#FFFFFF", color: "#0F172A", borderRadius: "999px", padding: "7px 10px", fontSize: "12px", fontWeight: 700 }}>
                  New patient to create
                </button>
                <button type="button" disabled={!patientMatches.length} onClick={() => setMatchDecision("existing")} style={{ border: `1px solid ${matchDecision === "existing" ? "#2563EB" : "#CBD5E1"}`, background: matchDecision === "existing" ? "#EFF6FF" : "#FFFFFF", color: patientMatches.length ? "#0F172A" : "#94A3B8", borderRadius: "999px", padding: "7px 10px", fontSize: "12px", fontWeight: 700 }}>
                  Existing patient matched
                </button>
                <button type="button" onClick={() => setMatchDecision("duplicate_review")} style={{ border: `1px solid ${matchDecision === "duplicate_review" ? "#D97706" : "#CBD5E1"}`, background: matchDecision === "duplicate_review" ? "#FFF7ED" : "#FFFFFF", color: "#0F172A", borderRadius: "999px", padding: "7px 10px", fontSize: "12px", fontWeight: 700 }}>
                  Possible duplicate requiring review
                </button>
              </div>
            </div>

            <div style={{ marginTop: "12px" }}>
              <label style={{ display: "block" }}>
                <span style={{ display: "block", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280", marginBottom: "4px" }}>Operator Notes</span>
                <textarea
                  value={stage.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                  rows={5}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: "6px", fontSize: "13px", color: "#0F172A", background: "#FFFFFF", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                />
              </label>
            </div>

            {submitError ? (
              <div style={{ marginTop: "12px", border: "1px solid #FECACA", background: "#FEF2F2", borderRadius: "6px", padding: "10px 12px", fontSize: "13px", color: "#DC2626" }}>{submitError}</div>
            ) : null}
            {requiredMissing.length ? (
              <div style={{ marginTop: "12px", border: "1px solid #FED7AA", background: "#FFF7ED", borderRadius: "6px", padding: "10px 12px", fontSize: "12px", color: "#9A3412" }}>
                <strong>Missing before Execute Intake:</strong> {requiredMissing.join(", ")}
              </div>
            ) : null}
            {manualMode ? (
              <div style={{ marginTop: "12px", border: "1px solid #FED7AA", background: "#FFF7ED", borderRadius: "6px", padding: "10px 12px" }}>
                <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#9A3412", fontWeight: 700 }}>Manual exception selected. Values entered manually will be recorded as operator-verified.</p>
                <textarea
                  value={manualReason}
                  onChange={(event) => setManualReason(event.target.value)}
                  rows={3}
                  placeholder="Reason automated extraction could not complete"
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #FDBA74", borderRadius: "6px", padding: "8px", fontSize: "12px", color: "#0F172A", background: "#FFFFFF" }}
                />
              </div>
            ) : null}
            {submitResult ? (
              <div style={{ marginTop: "12px", border: "1px solid #BBF7D0", background: "#F0FDF4", borderRadius: "6px", padding: "10px 12px", fontSize: "13px", color: "#15803D" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600, marginBottom: "4px" }}>
                  <CheckCircle2 style={{ width: "15px", height: "15px" }} />
                  Intake executed
                </div>
                <p style={{ margin: 0, fontSize: "12px" }}>Case {submitResult.caseId.slice(0, 8)} / Order {submitResult.orderId.slice(0, 8)}. Status: {submitResult.status}</p>
              </div>
            ) : null}

            <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={submitVerified}
                disabled={submitting || (!manualMode && requiredMissing.length > 0)}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "12px",
                  background: "#0F172A",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: submitting ? "wait" : (!manualMode && requiredMissing.length > 0) ? "not-allowed" : "pointer",
                  opacity: submitting || (!manualMode && requiredMissing.length > 0) ? 0.6 : 1,
                }}
              >
                {submitting ? <Loader2 style={{ width: "15px", height: "15px", animation: "spin 1s linear infinite" }} /> : <Play style={{ width: "15px", height: "15px" }} />}
                Execute Intake
              </button>
              <button
                type="button"
                onClick={() => {
                  setStage(EMPTY_STAGE)
                  setSignals([])
                  setRawText("")
                  setPages([])
                  setProgress([])
                  setWarnings([])
                  setDocumentId("")
                  setManualMode(false)
                  setManualReason("")
                  setOperatorCorrections({})
                  setPatientMatches([])
                  setMatchDecision("")
                  setSelectedMatchId("")
                  setSubmitResult(null)
                  setSubmitError(null)
                }}
                style={{
                  padding: "12px 16px",
                  background: "#FFFFFF",
                  color: "#374151",
                  border: "1px solid #E5E7EB",
                  borderRadius: "6px",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Parsed fields + workflow */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <ParsedFieldsView signals={signals} rawText={rawText} parserSource={parserSource} pages={pages} progress={progress} warnings={warnings} onViewPage={setSelectedPage} />
            <div style={{ border: "1px solid #E5E7EB", borderRadius: "8px", padding: "16px", background: "#FFFFFF" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <Database style={{ width: "15px", height: "15px", color: "#6B7280" }} />
                <p style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A", margin: 0 }}>Workflow Handoff</p>
              </div>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  "Create or match patient in Poseidon Core.",
                  "Create draft intake order with extracted coding context.",
                  "Attach source document to the order record.",
                  "Trigger Core intake advancement for eligibility verification.",
                ].map((step, i) => (
                  <li key={i} style={{ fontSize: "12px", color: "#6B7280", display: "flex", gap: "8px" }}>
                    <span style={{ flexShrink: 0, fontWeight: 600, color: "#9CA3AF" }}>{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
