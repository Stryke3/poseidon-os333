"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"

type ParsedData = {
  first_name?: string
  last_name?: string
  date_of_birth?: string
  insurance_info?: {
    payer_name?: string
    member_id?: string
  }
  diagnosis_codes?: string[]
  physician_npi?: string
  hcpcs_codes?: string[]
  raw_text_preview?: string
}

type FormState = {
  first_name: string
  last_name: string
  dob: string
  email: string
  phone: string
  insurance_id: string
  payer_id: string
  diagnosis_codes: string
  hcpcs_codes: string
  referring_npi: string
  notes: string
  priority: string
}

const EMPTY_FORM: FormState = {
  first_name: "",
  last_name: "",
  dob: "",
  email: "",
  phone: "",
  insurance_id: "",
  payer_id: "",
  diagnosis_codes: "",
  hcpcs_codes: "",
  referring_npi: "",
  notes: "",
  priority: "standard",
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
      {label}
      {required && <span className="ml-1 text-accent-red">*</span>}
    </label>
  )
}

function FieldInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent-blue/40 disabled:opacity-50"
    />
  )
}

export default function PatientIntakeForm() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [dragActive, setDragActive] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedPreview, setParsedPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [droppedFileName, setDroppedFileName] = useState<string | null>(null)

  const updateField = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const isPdfFile = useCallback((file: File) => {
    const nameLooksPdf = file.name.toLowerCase().endsWith(".pdf")
    const mimeLooksPdf = (file.type || "").toLowerCase().includes("pdf")
    return nameLooksPdf || mimeLooksPdf
  }, [])

  const handleParsePdf = useCallback(async (file: File) => {
    setParsing(true)
    setParseError(null)
    setParsedPreview(null)
    setDroppedFileName(file.name)

    try {
      const fd = new FormData()
      fd.append("file", file)

      const res = await fetch("/api/intake/parse", { method: "POST", body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || `Parse failed (${res.status})`)
      }

      const data = (await res.json()) as ParsedData

      setForm((prev) => ({
        ...prev,
        first_name: data.first_name || prev.first_name,
        last_name: data.last_name || prev.last_name,
        dob: data.date_of_birth || prev.dob,
        insurance_id: data.insurance_info?.member_id || prev.insurance_id,
        payer_id: data.insurance_info?.payer_name || prev.payer_id,
        diagnosis_codes: data.diagnosis_codes?.join(", ") || prev.diagnosis_codes,
        hcpcs_codes: data.hcpcs_codes?.join(", ") || prev.hcpcs_codes,
        referring_npi: data.physician_npi || prev.referring_npi,
      }))

      if (data.raw_text_preview) {
        setParsedPreview(data.raw_text_preview.slice(0, 600))
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse PDF")
    } finally {
      setParsing(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)

      const file = e.dataTransfer.files[0]
      if (file && isPdfFile(file)) {
        void handleParsePdf(file)
      } else {
        setParseError("Only PDF files are supported")
      }
    },
    [handleParsePdf, isPdfFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }, [])

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file && isPdfFile(file)) {
        void handleParsePdf(file)
      } else if (file) {
        setParseError("Only PDF files are supported")
      }
      e.target.value = ""
    },
    [handleParsePdf, isPdfFile],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitError(null)
      setSubmitSuccess(null)

      if (!form.first_name.trim() || !form.last_name.trim()) {
        setSubmitError("First and last name are required")
        return
      }
      if (!form.insurance_id.trim()) {
        setSubmitError("Insurance / Member ID is required")
        return
      }
      if (!form.payer_id.trim()) {
        setSubmitError("Payer is required")
        return
      }

      setSubmitting(true)
      try {
        const diagCodes = form.diagnosis_codes
          .split(/[,\s]+/)
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean)

        const payload = {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          dob: form.dob || undefined,
          email: form.email || undefined,
          phone: form.phone || undefined,
          insurance_id: form.insurance_id.trim(),
          payer_id: form.payer_id.trim(),
          diagnosis_codes: diagCodes.length > 0 ? diagCodes : ["Z00.00"],
        }

        const res = await fetch("/api/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        const data = await res.json()
        if (!res.ok) {
          throw new Error(
            (data as { detail?: string; error?: string }).detail ||
              (data as { error?: string }).error ||
              "Failed to create patient",
          )
        }

        const patientId = (data as { patient_id?: string }).patient_id
        setSubmitSuccess(`Patient created${patientId ? ` (${patientId.slice(0, 8)})` : ""}`)
        setForm(EMPTY_FORM)
        setDroppedFileName(null)
        setParsedPreview(null)

        if (patientId) {
          setTimeout(() => router.push(`/patients/${patientId}`), 1500)
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Failed to create patient")
      } finally {
        setSubmitting(false)
      }
    },
    [form, router],
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* PDF Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
          dragActive
            ? "border-accent-blue bg-accent-blue/10"
            : droppedFileName
              ? "border-accent-green/40 bg-accent-green/5"
              : "border-white/15 bg-black/10 hover:border-accent-blue/40 hover:bg-accent-blue/5"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileInput}
        />

        {parsing ? (
          <div className="space-y-2">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
            <p className="text-sm text-accent-blue">Parsing PDF...</p>
          </div>
        ) : droppedFileName ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-accent-green">PDF parsed successfully</p>
            <p className="text-xs text-slate-400">{droppedFileName}</p>
            <p className="mt-2 text-[11px] text-slate-500">Drop another PDF to re-parse, or edit the fields below</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl text-slate-400">
              PDF
            </div>
            <p className="text-sm font-semibold text-slate-300">
              Drop a referral PDF here to auto-fill
            </p>
            <p className="text-xs text-slate-500">
              Extracts patient name, DOB, insurance, diagnosis codes, HCPCS, and NPI
            </p>
            <p className="text-[10px] text-slate-600">or click to browse</p>
          </div>
        )}
      </div>

      {parseError && (
        <div className="rounded-xl border border-accent-red/30 bg-accent-red/10 px-4 py-2.5 text-xs text-accent-red">
          {parseError}
        </div>
      )}

      {parsedPreview && (
        <details className="rounded-xl border border-white/10 bg-black/10">
          <summary className="cursor-pointer px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-300">
            Extracted text preview
          </summary>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap px-4 pb-3 text-[10px] leading-relaxed text-slate-500">
            {parsedPreview}
          </pre>
        </details>
      )}

      {/* Patient Info */}
      <div className="rounded-2xl border border-white/10 bg-black/10 p-5">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-blue">
          Patient Information
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel label="First Name" required />
            <FieldInput value={form.first_name} onChange={(v) => updateField("first_name", v)} placeholder="John" />
          </div>
          <div>
            <FieldLabel label="Last Name" required />
            <FieldInput value={form.last_name} onChange={(v) => updateField("last_name", v)} placeholder="Smith" />
          </div>
          <div>
            <FieldLabel label="Date of Birth" />
            <FieldInput value={form.dob} onChange={(v) => updateField("dob", v)} placeholder="YYYY-MM-DD" type="date" />
          </div>
          <div>
            <FieldLabel label="Email" />
            <FieldInput value={form.email} onChange={(v) => updateField("email", v)} placeholder="patient@email.com" type="email" />
          </div>
          <div>
            <FieldLabel label="Phone" />
            <FieldInput value={form.phone} onChange={(v) => updateField("phone", v)} placeholder="(555) 123-4567" />
          </div>
        </div>
      </div>

      {/* Insurance & Payer */}
      <div className="rounded-2xl border border-white/10 bg-black/10 p-5">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-blue">
          Insurance / Payer
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel label="Insurance / Member ID" required />
            <FieldInput value={form.insurance_id} onChange={(v) => updateField("insurance_id", v)} placeholder="MBR-123456" />
          </div>
          <div>
            <FieldLabel label="Payer" required />
            <FieldInput value={form.payer_id} onChange={(v) => updateField("payer_id", v)} placeholder="Aetna, BCBS, Medicare..." />
          </div>
        </div>
      </div>

      {/* Clinical */}
      <div className="rounded-2xl border border-white/10 bg-black/10 p-5">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-blue">
          Clinical Details
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel label="Diagnosis Codes (ICD-10)" />
            <FieldInput
              value={form.diagnosis_codes}
              onChange={(v) => updateField("diagnosis_codes", v)}
              placeholder="M54.5, G89.4"
            />
            <p className="mt-1 text-[10px] text-slate-600">Comma-separated</p>
          </div>
          <div>
            <FieldLabel label="HCPCS Codes" />
            <FieldInput
              value={form.hcpcs_codes}
              onChange={(v) => updateField("hcpcs_codes", v)}
              placeholder="E0601, K0823"
            />
            <p className="mt-1 text-[10px] text-slate-600">Comma-separated</p>
          </div>
          <div>
            <FieldLabel label="Referring Physician NPI" />
            <FieldInput
              value={form.referring_npi}
              onChange={(v) => updateField("referring_npi", v)}
              placeholder="1234567890"
            />
          </div>
          <div>
            <FieldLabel label="Priority" />
            <select
              value={form.priority}
              onChange={(e) => updateField("priority", e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent-blue/40"
            >
              <option value="standard">Standard</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <FieldLabel label="Notes" />
          <textarea
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Additional context, special instructions..."
            rows={3}
            className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent-blue/40"
          />
        </div>
      </div>

      {/* Status messages */}
      {submitError && (
        <div className="rounded-xl border border-accent-red/30 bg-accent-red/10 px-4 py-2.5 text-xs text-accent-red">
          {submitError}
        </div>
      )}
      {submitSuccess && (
        <div className="rounded-xl border border-accent-green/30 bg-accent-green/10 px-4 py-2.5 text-xs text-accent-green">
          {submitSuccess} — redirecting to patient chart...
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY_FORM)
            setDroppedFileName(null)
            setParsedPreview(null)
            setParseError(null)
            setSubmitError(null)
            setSubmitSuccess(null)
          }}
          className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-semibold text-slate-400 transition hover:border-white/20 hover:text-white"
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl border border-accent-blue/30 bg-accent-blue/15 px-8 py-2.5 text-sm font-semibold text-accent-blue transition hover:bg-accent-blue/25 disabled:cursor-wait disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create Patient"}
        </button>
      </div>
    </form>
  )
}
