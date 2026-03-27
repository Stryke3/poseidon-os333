"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

type FormState = {
  first_name: string
  last_name: string
  dob: string
  phone: string
  email: string
  payer_id: string
  insurance_id: string
  icd10_codes: string
  hcpcs_codes: string
  device_description: string
  referring_npi: string
  insurance_auth_number: string
  priority: "standard" | "urgent" | "stat"
  notes: string
}

const EMPTY_FORM: FormState = {
  first_name: "",
  last_name: "",
  dob: "",
  phone: "",
  email: "",
  payer_id: "",
  insurance_id: "",
  icd10_codes: "",
  hcpcs_codes: "",
  device_description: "",
  referring_npi: "",
  insurance_auth_number: "",
  priority: "standard",
  notes: "",
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
      {label}
      {required && <span className="ml-1 text-accent-red">*</span>}
    </label>
  )
}

function FieldInput({ value, onChange, placeholder, type = "text" }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-accent-blue/40"
    />
  )
}

function parseCodes(value: string) {
  return value
    .split(/[,\s]+/)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
}

export default function PatientIntakeForm() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [swoFile, setSwoFile] = useState<File | null>(null)
  const [supportingFiles, setSupportingFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

  const updateField = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const icd10Codes = useMemo(() => parseCodes(form.icd10_codes), [form.icd10_codes])
  const hcpcsCodes = useMemo(() => parseCodes(form.hcpcs_codes), [form.hcpcs_codes])

  const uploadDocument = useCallback(async (patientId: string, orderId: string, docType: string, file: File) => {
    const docForm = new FormData()
    docForm.set("doc_type", docType)
    docForm.set("file", file)
    const uploadRes = await fetch(`/api/patients/${patientId}/orders/${orderId}/documents`, {
      method: "POST",
      body: docForm,
    })
    if (!uploadRes.ok) {
      const uploadData = (await uploadRes.json().catch(() => ({}))) as { detail?: string; error?: string }
      throw new Error(uploadData.detail || uploadData.error || `Failed to upload ${file.name}`)
    }
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitError(null)
      setSubmitSuccess(null)

      if (!form.first_name.trim() || !form.last_name.trim()) {
        setSubmitError("First and last name are required")
        return
      }
      if (!form.dob.trim()) {
        setSubmitError("Date of birth is required")
        return
      }
      if (!form.payer_id.trim()) {
        setSubmitError("Payer is required")
        return
      }
      if (!form.insurance_id.trim()) {
        setSubmitError("Insurance / Member ID is required")
        return
      }
      if (icd10Codes.length === 0) {
        setSubmitError("At least one ICD-10 code is required")
        return
      }
      if (hcpcsCodes.length === 0) {
        setSubmitError("At least one HCPCS/device code is required")
        return
      }
      if (!form.referring_npi.trim()) {
        setSubmitError("Referring physician NPI is required")
        return
      }

      setSubmitting(true)
      try {
        const patientPayload = {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          dob: form.dob.trim(),
          email: form.email || undefined,
          phone: form.phone || undefined,
          payer_id: form.payer_id.trim(),
          insurance_id: form.insurance_id.trim(),
          diagnosis_codes: icd10Codes,
        }

        const patientRes = await fetch("/api/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patientPayload),
        })

        const patientData = await patientRes.json().catch(() => ({}))
        if (!patientRes.ok) {
          throw new Error(
            (patientData as { detail?: string; error?: string }).detail ||
              (patientData as { error?: string }).error ||
              "Failed to create patient",
          )
        }

        const patientId = (patientData as { patient_id?: string }).patient_id
        if (!patientId) {
          throw new Error("Patient created but ID was not returned")
        }

        const orderPayload = {
          patient_id: patientId,
          hcpcs_codes: hcpcsCodes,
          referring_physician_npi: form.referring_npi.trim(),
          payer_id: form.payer_id.trim(),
          insurance_auth_number: form.insurance_auth_number.trim() || undefined,
          notes: form.notes.trim() || undefined,
          priority: form.priority,
          source_channel: "manual",
          intake_payload: {
            patient_input: {
              first_name: form.first_name.trim(),
              last_name: form.last_name.trim(),
              dob: form.dob.trim(),
              email: form.email.trim() || null,
              phone: form.phone.trim() || null,
            },
            coding: {
              icd10_codes: icd10Codes,
              hcpcs_codes: hcpcsCodes,
              device_description: form.device_description.trim() || null,
            },
            workflow: {
              swo_expected: true,
              order_status: "intake",
              delivery_status: "pending",
            },
          },
          source_reference: "frontend-intake",
          vertical: "dme",
          product_category: form.device_description.trim() || "manual-intake",
          source: "manual",
        }

        const orderRes = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderPayload),
        })
        const orderData = await orderRes.json().catch(() => ({}))
        if (!orderRes.ok) {
          throw new Error(
            (orderData as { detail?: string; error?: string }).detail ||
              (orderData as { error?: string }).error ||
              "Failed to create order",
          )
        }
        const orderId = (orderData as { order_id?: string }).order_id
        if (!orderId) {
          throw new Error("Order created but ID was not returned")
        }

        if (swoFile) {
          await uploadDocument(patientId, orderId, "swo", swoFile)
        }
        for (const file of supportingFiles) {
          await uploadDocument(patientId, orderId, "referral", file)
        }

        setSubmitSuccess(`Patient and intake order created (${orderId.slice(0, 8)})`)
        setForm(EMPTY_FORM)
        setSwoFile(null)
        setSupportingFiles([])
        setTimeout(() => router.push("/intake"), 1000)
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Failed to submit intake")
      } finally {
        setSubmitting(false)
      }
    },
    [form, hcpcsCodes, icd10Codes, router, supportingFiles, swoFile, uploadDocument],
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-black/10 p-5">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-blue">
          Patient
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
            <FieldLabel label="Date of Birth" required />
            <FieldInput value={form.dob} onChange={(v) => updateField("dob", v)} type="date" />
          </div>
          <div>
            <FieldLabel label="Phone" />
            <FieldInput value={form.phone} onChange={(v) => updateField("phone", v)} placeholder="(555) 123-4567" />
          </div>
          <div>
            <FieldLabel label="Email" />
            <FieldInput value={form.email} onChange={(v) => updateField("email", v)} placeholder="patient@email.com" type="email" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/10 p-5">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-blue">
          Coverage
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel label="Payer" required />
            <FieldInput value={form.payer_id} onChange={(v) => updateField("payer_id", v)} placeholder="Aetna, BCBS, Medicare..." />
          </div>
          <div>
            <FieldLabel label="Insurance / Member ID" required />
            <FieldInput value={form.insurance_id} onChange={(v) => updateField("insurance_id", v)} placeholder="MBR-123456" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/10 p-5">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-blue">
          Intake Order
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel label="Diagnosis Codes (ICD-10)" required />
            <FieldInput
              value={form.icd10_codes}
              onChange={(v) => updateField("icd10_codes", v)}
              placeholder="M54.5, G89.4"
            />
            <p className="mt-1 text-[10px] text-slate-600">Comma-separated</p>
          </div>
          <div>
            <FieldLabel label="HCPCS / Device Codes" required />
            <FieldInput
              value={form.hcpcs_codes}
              onChange={(v) => updateField("hcpcs_codes", v)}
              placeholder="L1833, L1686, K0823"
            />
            <p className="mt-1 text-[10px] text-slate-600">Comma-separated</p>
          </div>
          <div>
            <FieldLabel label="Device Description" />
            <FieldInput
              value={form.device_description}
              onChange={(v) => updateField("device_description", v)}
              placeholder="Power wheelchair, brace, bed..."
            />
          </div>
          <div>
            <FieldLabel label="Referring Physician NPI" required />
            <FieldInput
              value={form.referring_npi}
              onChange={(v) => updateField("referring_npi", v)}
              placeholder="1234567890"
            />
          </div>
          <div>
            <FieldLabel label="Insurance Auth Number" />
            <FieldInput
              value={form.insurance_auth_number}
              onChange={(v) => updateField("insurance_auth_number", v)}
              placeholder="Optional"
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

      <div className="rounded-2xl border border-white/10 bg-black/10 p-5">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-blue">
          Documents
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel label="Signed SWO (optional PDF)" />
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setSwoFile(e.target.files?.[0] || null)}
              className="mt-1 block w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-accent-blue/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-accent-blue"
            />
            <p className="mt-1 text-[10px] text-slate-600">{swoFile ? `Selected: ${swoFile.name}` : "No SWO selected"}</p>
          </div>
          <div>
            <FieldLabel label="Referral / supporting docs (optional)" />
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setSupportingFiles(Array.from(e.target.files || []))}
              className="mt-1 block w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-accent-blue/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-accent-blue"
            />
            <p className="mt-1 text-[10px] text-slate-600">
              {supportingFiles.length ? `${supportingFiles.length} file(s) selected` : "No files selected"}
            </p>
          </div>
        </div>
      </div>

      {submitError && (
        <div className="rounded-xl border border-accent-red/30 bg-accent-red/10 px-4 py-2.5 text-xs text-accent-red">
          {submitError}
        </div>
      )}
      {submitSuccess && (
        <div className="rounded-xl border border-accent-green/30 bg-accent-green/10 px-4 py-2.5 text-xs text-accent-green">
          {submitSuccess} - sending to intake board...
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY_FORM)
            setSwoFile(null)
            setSupportingFiles([])
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
          {submitting ? "Saving..." : "Create Patient + Intake Order"}
        </button>
      </div>
    </form>
  )
}
