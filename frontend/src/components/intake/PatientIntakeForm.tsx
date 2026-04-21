"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  buildCanonicalIntakePatientBody,
  formatIntakeCanonicalResult,
} from "@/lib/intake-canonical-payload"
import {
  buildTridentSnapshotForStorage,
  canRequestTridentScore,
  patientAgeFromIsoDob,
  tridentInterpretation,
  type TridentScoreApiResponse,
} from "@/lib/trident-score"

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
  doctor_name: string
  doctor_phone: string
  doctor_fax: string
  doctor_email: string
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
  doctor_name: "",
  doctor_phone: "",
  doctor_fax: "",
  doctor_email: "",
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

function safeLower(s: string | null | undefined): string {
  return (s ?? "").toLowerCase()
}

type CodingRecommendation = {
  hcpcs_code: string
  score?: number | null
  requires_auth?: boolean | null
  avg_reimbursement?: number | null
  denial_probability?: number | null
}

type PayerOption = {
  id: string
  name: string
  availity_payer_id?: string | null
  availity_payer_name?: string | null
}
type Icd10Option = { code: string; description: string }
type HcpcsOption = { code: string; description: string; long_description?: string }
type PhysicianOption = {
  npi: string
  full_name: string
  first_name?: string
  last_name?: string
  specialty?: string
  phone?: string
  fax?: string
}

type TridentUiState =
  | null
  | { status: "loading" }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string }
  | { status: "ok"; score: TridentScoreApiResponse }

export default function PatientIntakeForm() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [swoFile, setSwoFile] = useState<File | null>(null)
  const [supportingFiles, setSupportingFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [tridentUi, setTridentUi] = useState<TridentUiState>(null)
  const [doctorLookupStatus, setDoctorLookupStatus] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<CodingRecommendation[]>([])
  const [recommendationStatus, setRecommendationStatus] = useState<string | null>(null)
  const [payerOptions, setPayerOptions] = useState<PayerOption[]>([])
  const [payersHydrated, setPayersHydrated] = useState(false)
  const [payersStatus, setPayersStatus] = useState<string | null>(null)
  const [payerFilter, setPayerFilter] = useState("")
  const [icd10Options, setIcd10Options] = useState<Icd10Option[]>([])
  const [icd10Status, setIcd10Status] = useState<string | null>(null)
  const [icd10Filter, setIcd10Filter] = useState("")
  const [hcpcsOptions, setHcpcsOptions] = useState<HcpcsOption[]>([])
  const [hcpcsStatus, setHcpcsStatus] = useState<string | null>(null)
  const [hcpcsFilter, setHcpcsFilter] = useState("")
  const [physicianOptions, setPhysicianOptions] = useState<PhysicianOption[]>([])
  const [physicianStatus, setPhysicianStatus] = useState<string | null>(null)
  const [physicianFilter, setPhysicianFilter] = useState("")

  const updateField = useCallback((field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const icd10Codes = useMemo(() => parseCodes(form.icd10_codes), [form.icd10_codes])
  const hcpcsCodes = useMemo(() => parseCodes(form.hcpcs_codes), [form.hcpcs_codes])
  const currentIcdToken = useMemo(() => {
    const segments = form.icd10_codes.split(",")
    return (segments[segments.length - 1] || "").trim()
  }, [form.icd10_codes])
  const currentHcpcsToken = useMemo(() => {
    const segments = form.hcpcs_codes.split(",")
    return (segments[segments.length - 1] || "").trim()
  }, [form.hcpcs_codes])

  const filteredPayers = useMemo(() => {
    const f = payerFilter.trim().toLowerCase()
    if (!f) return payerOptions
    return payerOptions.filter(
      (p) => safeLower(p?.id).includes(f) || safeLower(p?.name).includes(f),
    )
  }, [payerFilter, payerOptions])

  const payersForSelect = useMemo(() => {
    const selected = payerOptions.find((p) => p.id === form.payer_id)
    if (!selected || filteredPayers.some((p) => p.id === selected.id)) {
      return filteredPayers
    }
    return [selected, ...filteredPayers]
  }, [filteredPayers, form.payer_id, payerOptions])

  const icd10ForSelect = useMemo(() => {
    const f = icd10Filter.trim().toLowerCase()
    const rows = icd10Options.filter((item) => item?.code)
    if (!f) return rows
    return rows.filter(
      (item) =>
        safeLower(item.code).includes(f) || safeLower(item.description).includes(f),
    )
  }, [icd10Filter, icd10Options])

  const hcpcsForSelect = useMemo(() => {
    const f = hcpcsFilter.trim().toLowerCase()
    const rows = hcpcsOptions.filter((item) => item?.code)
    if (!f) return rows
    return rows.filter(
      (item) =>
        safeLower(item.code).includes(f) ||
        safeLower(item.description).includes(f) ||
        safeLower(item.long_description).includes(f),
    )
  }, [hcpcsFilter, hcpcsOptions])

  const physiciansForSelect = useMemo(() => {
    const f = physicianFilter.trim().toLowerCase()
    const rows = physicianOptions.filter((item) => item?.npi)
    if (!f) return rows
    return rows.filter(
      (item) =>
        safeLower(item.full_name).includes(f) ||
        safeLower(item.npi).includes(f) ||
        safeLower(item.specialty).includes(f),
    )
  }, [physicianFilter, physicianOptions])

  useEffect(() => {
    let cancelled = false
    setPayersStatus("Loading payer directory…")
    fetch("/api/reference/payers", { cache: "no-store", credentials: "include" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          payers?: PayerOption[]
          error?: string
          detail?: string
        }
        if (!res.ok) {
          throw new Error(data.detail || data.error || "Failed to load payers")
        }
        const list = (Array.isArray(data.payers) ? data.payers : []).filter(
          (p): p is PayerOption => Boolean(p && typeof p.id === "string" && p.id.trim().length > 0),
        )
        if (!cancelled) {
          setPayerOptions(list)
          setPayersStatus(list.length ? null : "No payers in directory — enter payer ID manually.")
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPayerOptions([])
          setPayersStatus("Could not load payer directory — enter payer ID manually.")
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPayersHydrated(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const query = (currentIcdToken || icd10Filter).trim()
    if (query.length < 2) {
      setIcd10Options([])
      setIcd10Status("Type 2+ characters to search ICD-10.")
      return
    }
    setIcd10Status("Loading ICD-10 suggestions…")
    const timer = setTimeout(() => {
      fetch(`/api/reference/icd10?query=${encodeURIComponent(query)}`, {
        cache: "no-store",
        credentials: "include",
      })
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            items?: Icd10Option[]
            error?: string
            detail?: string
          }
          if (!res.ok) {
            throw new Error(data.detail || data.error || "Failed to load ICD-10 suggestions")
          }
          if (!cancelled) {
            const list = (Array.isArray(data.items) ? data.items : []).filter(
              (row): row is Icd10Option => Boolean(row && typeof row.code === "string" && row.code.trim().length > 0),
            )
            setIcd10Options(list)
            setIcd10Status(list.length ? null : "No ICD-10 matches found.")
          }
        })
        .catch(() => {
          if (!cancelled) {
            setIcd10Options([])
            setIcd10Status("Could not load ICD-10 suggestions.")
          }
        })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [currentIcdToken, icd10Filter])

  useEffect(() => {
    let cancelled = false
    const query = (currentHcpcsToken || hcpcsFilter).trim()
    if (query.length < 2) {
      setHcpcsOptions([])
      setHcpcsStatus("Type 2+ characters to search HCPCS.")
      return
    }
    setHcpcsStatus("Loading HCPCS suggestions…")
    const timer = setTimeout(() => {
      fetch(`/api/reference/hcpcs?query=${encodeURIComponent(query)}`, {
        cache: "no-store",
        credentials: "include",
      })
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            items?: HcpcsOption[]
            error?: string
            detail?: string
          }
          if (!res.ok) {
            throw new Error(data.detail || data.error || "Failed to load HCPCS suggestions")
          }
          if (!cancelled) {
            const list = (Array.isArray(data.items) ? data.items : []).filter(
              (row): row is HcpcsOption => Boolean(row && typeof row.code === "string" && row.code.trim().length > 0),
            )
            setHcpcsOptions(list)
            setHcpcsStatus(list.length ? null : "No HCPCS matches found.")
          }
        })
        .catch(() => {
          if (!cancelled) {
            setHcpcsOptions([])
            setHcpcsStatus("Could not load HCPCS suggestions.")
          }
        })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [currentHcpcsToken, hcpcsFilter])

  useEffect(() => {
    let cancelled = false
    const query = (physicianFilter || form.doctor_name || form.referring_npi).trim()
    if (query.length < 2) {
      setPhysicianOptions([])
      setPhysicianStatus("Type doctor name or NPI to search.")
      return
    }
    setPhysicianStatus("Searching physician directory…")
    const timer = setTimeout(() => {
      fetch(`/api/reference/physicians?query=${encodeURIComponent(query)}`, {
        cache: "no-store",
        credentials: "include",
      })
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            items?: PhysicianOption[]
            error?: string
            detail?: string
          }
          if (!res.ok) {
            throw new Error(data.detail || data.error || "Failed to load physician suggestions")
          }
          if (!cancelled) {
            const list = (Array.isArray(data.items) ? data.items : []).filter(
              (row): row is PhysicianOption =>
                Boolean(row?.npi != null && String(row.npi).trim().length > 0),
            )
            setPhysicianOptions(list)
            setPhysicianStatus(list.length ? null : "No physician matches found.")
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPhysicianOptions([])
            setPhysicianStatus("Could not load physician suggestions.")
          }
        })
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [form.doctor_name, form.referring_npi, physicianFilter])

  const applyIcd10Option = useCallback((code: string) => {
    const segments = form.icd10_codes.split(",")
    const nextSegments = segments
      .slice(0, Math.max(0, segments.length - 1))
      .map((part) => part.trim())
      .filter(Boolean)
    nextSegments.push(code)
    updateField("icd10_codes", nextSegments.join(", "))
    setIcd10Filter("")
  }, [form.icd10_codes, updateField])

  const applyHcpcsOption = useCallback((item: HcpcsOption) => {
    const segments = form.hcpcs_codes.split(",")
    const nextSegments = segments
      .slice(0, Math.max(0, segments.length - 1))
      .map((part) => part.trim())
      .filter(Boolean)
    nextSegments.push(item.code)
    setForm((prev) => ({
      ...prev,
      hcpcs_codes: nextSegments.join(", "),
      device_description: prev.device_description.trim() || item.description || prev.device_description,
    }))
    setHcpcsFilter("")
  }, [form.hcpcs_codes])

  const applyPhysicianOption = useCallback((physician: PhysicianOption) => {
    setForm((prev) => ({
      ...prev,
      referring_npi: physician.npi || prev.referring_npi,
      doctor_name: physician.full_name || prev.doctor_name,
      doctor_phone: physician.phone || prev.doctor_phone,
      doctor_fax: physician.fax || prev.doctor_fax,
    }))
    setPhysicianFilter(physician.full_name || "")
    setDoctorLookupStatus(physician.full_name ? `Loaded ${physician.full_name}` : "Physician selected.")
  }, [])

  const lookupPhysicianByNpi = useCallback(async () => {
    const npi = form.referring_npi.trim()
    if (!/^\d{10}$/.test(npi)) {
      setDoctorLookupStatus("Enter a valid 10-digit NPI.")
      return
    }
    setDoctorLookupStatus("Looking up physician...")
    const res = await fetch(`/api/physicians/lookup?npi=${encodeURIComponent(npi)}`, {
      cache: "no-store",
      credentials: "include",
    }).catch(() => null)
    if (!res) {
      setDoctorLookupStatus("Unable to reach physician directory.")
      return
    }
    const data = (await res.json().catch(() => ({}))) as {
      physician?: { full_name?: string | null; phone?: string | null; fax?: string | null }
      error?: string
      detail?: string
    }
    if (!res.ok) {
      setDoctorLookupStatus(data.detail || data.error || "NPI not found.")
      return
    }
    const fullName = data.physician?.full_name?.trim() || ""
    const phone = data.physician?.phone?.trim() || ""
    const fax = data.physician?.fax?.trim() || ""
    setForm((prev) => ({
      ...prev,
      doctor_name: prev.doctor_name.trim() || fullName,
      doctor_phone: prev.doctor_phone.trim() || phone,
      doctor_fax: prev.doctor_fax.trim() || fax,
    }))
    setDoctorLookupStatus(fullName ? `Loaded ${fullName}` : "Physician loaded from NPI.")
  }, [form.referring_npi])

  const fetchCodingRecommendations = useCallback(async () => {
    const payerId = form.payer_id.trim()
    if (!payerId || icd10Codes.length === 0) {
      setRecommendations([])
      return
    }
    setRecommendationStatus("Fetching coding recommendations...")
    const res = await fetch("/api/intake/coding-recommendations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payer_id: payerId,
        icd10_codes: icd10Codes,
        physician_npi: form.referring_npi.trim() || undefined,
        limit: 5,
      }),
    }).catch(() => null)
    if (!res) {
      setRecommendationStatus("Unable to reach coding engine.")
      return
    }
    const data = (await res.json().catch(() => ({}))) as {
      recommendations?: CodingRecommendation[]
      error?: string
      detail?: string
    }
    if (!res.ok) {
      const d = data.detail || data.error || "Recommendation lookup failed."
      setRecommendationStatus(d === "unexpected_error" ? "Coding recommendations unavailable (service error)." : d)
      return
    }
    const next = Array.isArray(data.recommendations) ? data.recommendations : []
    setRecommendations(next)
    if (next.length > 0 && hcpcsCodes.length === 0) {
      updateField("hcpcs_codes", next.map((row) => row.hcpcs_code).join(", "))
    }
    setRecommendationStatus(next.length > 0 ? "Recommendations ready." : "No recommendations found.")
  }, [form.payer_id, form.referring_npi, hcpcsCodes.length, icd10Codes, updateField])

  useEffect(() => {
    if (!form.payer_id.trim() || icd10Codes.length === 0) return
    const timer = setTimeout(() => {
      fetchCodingRecommendations().catch(() => {
        setRecommendationStatus("Recommendation lookup failed.")
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [fetchCodingRecommendations, form.payer_id, icd10Codes])

  const uploadDocument = useCallback(async (patientId: string, orderId: string, docType: string, file: File) => {
    const docForm = new FormData()
    docForm.set("doc_type", docType)
    docForm.set("file", file)
    const uploadRes = await fetch(`/api/patients/${patientId}/orders/${orderId}/documents`, {
      method: "POST",
      credentials: "include",
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

      setSubmitting(true)
      const idempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `idem-intake-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

      try {
        const body = buildCanonicalIntakePatientBody(form, icd10Codes, hcpcsCodes, payerOptions)

        const intakeRes = await fetch("/api/intake/patient", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(body),
        })

        const data = (await intakeRes.json().catch(() => ({}))) as Record<string, unknown>
        if (!intakeRes.ok) {
          const raw =
            (typeof data.detail === "string" && data.detail) ||
            (typeof data.message === "string" && data.message) ||
            (typeof data.error === "string" && data.error) ||
            `Intake failed (${intakeRes.status})`
          const msg =
            raw === "unexpected_error"
              ? "Intake service error (check intake logs). If this persists, try again or contact support."
              : raw
          throw new Error(msg)
        }

        const createdPatientId = typeof data.patient_id === "string" ? data.patient_id : null
        const orderId = typeof data.order_id === "string" ? data.order_id : null
        const reviewQueued = Boolean(data.review_queued)

        const uploadErrors: string[] = []
        if (orderId && createdPatientId) {
          try {
            if (swoFile) {
              await uploadDocument(createdPatientId, orderId, "swo", swoFile)
            }
            for (const file of supportingFiles) {
              await uploadDocument(createdPatientId, orderId, "other", file)
            }
          } catch (uploadErr) {
            const u = uploadErr instanceof Error ? uploadErr.message : "Attachment upload failed"
            uploadErrors.push(u)
          }
        }

        let successMsg = formatIntakeCanonicalResult(data)
        if (reviewQueued && !orderId && (swoFile || supportingFiles.length > 0)) {
          successMsg += " Attachments were not uploaded (no order yet — add coverage/coding/NPI for a full order)."
        }
        if (uploadErrors.length > 0) {
          successMsg += ` Document upload note: ${uploadErrors.join("; ")}`
        }
        setSubmitSuccess(successMsg)
        setTridentUi(null)

        const payerForScore = form.payer_id.trim()
        const npiForScore = form.referring_npi.trim()
        const dobForScore = form.dob.trim()
        if (canRequestTridentScore({ payerId: payerForScore, icd10Codes, hcpcsCodes })) {
          setTridentUi({ status: "loading" })
          const scoreBody = {
            icd10_codes: icd10Codes,
            hcpcs_codes: hcpcsCodes,
            payer_id: payerForScore,
            physician_npi: npiForScore || undefined,
            patient_age: patientAgeFromIsoDob(dobForScore),
            dos: new Date().toISOString().slice(0, 10),
          }
          void fetch("/api/trident/score", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(scoreBody),
          })
            .then(async (r) => {
              const j = (await r.json().catch(() => ({}))) as TridentScoreApiResponse
              if (!r.ok) {
                setTridentUi({
                  status: "error",
                  message:
                    (typeof j.detail === "string" && j.detail) ||
                    (typeof j.error === "string" && j.error) ||
                    `Trident score failed (${r.status})`,
                })
                return
              }
              setTridentUi({ status: "ok", score: j })
              if (orderId) {
                void fetch(`/api/orders/${orderId}/trident-snapshot`, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ snapshot: buildTridentSnapshotForStorage(j) }),
                }).catch(() => {})
              }
            })
            .catch(() => {
              setTridentUi({ status: "error", message: "Could not reach Trident score service." })
            })
        } else {
          setTridentUi({
            status: "skipped",
            reason:
              "Trident risk preview needs a payer, at least one ICD-10, and one HCPCS. Add those fields and save again, or open the patient from the queue after enrichment.",
          })
        }

        if (!reviewQueued || orderId) {
          setForm(EMPTY_FORM)
          setSwoFile(null)
          setSupportingFiles([])
        }
      } catch (err) {
        const baseMessage = err instanceof Error ? err.message : "Failed to submit intake"
        setSubmitError(baseMessage)
      } finally {
        setSubmitting(false)
      }
    },
    [form, hcpcsCodes, icd10Codes, payerOptions, supportingFiles, swoFile, uploadDocument],
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-relaxed text-slate-300">
        Submits to the Intake service. Minimum: name and date of birth. For a full billable order, add payer, member ID,
        ICD-10, HCPCS, and referring NPI; otherwise the patient is saved and the case is queued for review.
      </p>
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
          <div className="sm:col-span-2">
            <FieldLabel label="Insurance payer" />
            {!payersHydrated ? (
              <p className="mt-1 text-sm text-slate-500">{payersStatus}</p>
            ) : payerOptions.length > 0 ? (
              <>
                <FieldInput
                  value={payerFilter}
                  onChange={(v) => setPayerFilter(v)}
                  placeholder="Type to filter (name or ID)…"
                />
                <select
                  value={form.payer_id}
                  onChange={(e) => updateField("payer_id", e.target.value)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent-blue/40"
                >
                  <option value="">Select insurance payer…</option>
                  {payersForSelect.map((p) => {
                    const pi = p.availity_payer_id?.trim() || p.id
                    const label = (p.name || p.id).trim()
                    return (
                      <option key={p.id} value={p.id}>
                        {label} — Availity PI {pi} · Poseidon {p.id}
                      </option>
                    )
                  })}
                </select>
                {payersForSelect.length === 0 && payerFilter.trim() && (
                  <p className="mt-1 text-[10px] text-slate-500">No matches — clear the filter or pick from the full list.</p>
                )}
              </>
            ) : (
              <FieldInput
                value={form.payer_id}
                onChange={(v) => updateField("payer_id", v)}
                placeholder="e.g. UHC, AETNA, MEDICARE_DMERC"
              />
            )}
            {payersHydrated && (
              <p className="mt-1 text-[10px] text-slate-500">
                {payersStatus ||
                  "Poseidon payer is stored on the patient; X12 270/837 uses the Availity PI code from the directory (confirm against your Availity payer list)."}
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <FieldLabel label="Physician search" />
            <FieldInput
              value={physicianFilter}
              onChange={setPhysicianFilter}
              placeholder="Type doctor name or NPI…"
            />
            {physiciansForSelect.length > 0 ? (
              <select
                value=""
                onChange={(e) => {
                  const selected = physiciansForSelect.find((item) => item.npi === e.target.value)
                  if (selected) applyPhysicianOption(selected)
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent-blue/40"
              >
                <option value="">Select physician to auto-fill contact + NPI…</option>
                {physiciansForSelect.map((item) => (
                  <option key={item.npi} value={item.npi}>
                    {item.full_name} ({item.npi}){item.specialty ? ` - ${item.specialty}` : ""}
                  </option>
                ))}
              </select>
            ) : null}
            <p className="mt-1 text-[10px] text-slate-500">
              {physicianStatus || "Search the physician directory to auto-fill doctor contact and NPI."}
            </p>
          </div>
          <div>
            <FieldLabel label="Insurance / Member ID" />
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
            <FieldLabel label="Diagnosis Codes (ICD-10)" />
            <FieldInput
              value={form.icd10_codes}
              onChange={(v) => updateField("icd10_codes", v)}
              placeholder="M54.5, G89.4"
            />
            {icd10ForSelect.length > 0 ? (
              <select
                value=""
                onChange={(e) => {
                  const selected = icd10ForSelect.find((item) => item.code === e.target.value)
                  if (selected) applyIcd10Option(selected.code)
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent-blue/40"
              >
                <option value="">Add ICD-10 code from dropdown…</option>
                {icd10ForSelect.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} - {item.description ?? ""}
                  </option>
                ))}
              </select>
            ) : null}
            <p className="mt-1 text-[10px] text-slate-600">
              {icd10Status || "Comma-separated. Use the dropdown to add the current ICD-10 code."}
            </p>
          </div>
          <div>
            <FieldLabel label="HCPCS / Device Codes" />
            <FieldInput
              value={form.hcpcs_codes}
              onChange={(v) => updateField("hcpcs_codes", v)}
              placeholder="L1833, L1686, K0823"
            />
            {hcpcsForSelect.length > 0 ? (
              <select
                value=""
                onChange={(e) => {
                  const selected = hcpcsForSelect.find((item) => item.code === e.target.value)
                  if (selected) applyHcpcsOption(selected)
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent-blue/40"
              >
                <option value="">Add HCPCS code from dropdown…</option>
                {hcpcsForSelect.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} - {item.description ?? ""}
                  </option>
                ))}
              </select>
            ) : null}
            <p className="mt-1 text-[10px] text-slate-600">
              {hcpcsStatus || "Comma-separated. Use the dropdown to add the current HCPCS code."}
            </p>
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
            <FieldLabel label="Referring Physician NPI" />
            <FieldInput
              value={form.referring_npi}
              onChange={(v) => updateField("referring_npi", v)}
              placeholder="1234567890"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] text-slate-500">{doctorLookupStatus || "Physician profile auto-fills from NPI directory."}</p>
              <button
                type="button"
                onClick={() => {
                  lookupPhysicianByNpi().catch(() => {
                    setDoctorLookupStatus("Unable to load physician details.")
                  })
                }}
                className="rounded-md border border-white/15 px-2 py-1 text-[10px] font-semibold text-slate-300 transition hover:border-white/30 hover:text-white"
              >
                Pull NPI profile
              </button>
            </div>
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
          {recommendationStatus && (
            <p className="mb-2 text-[10px] text-slate-500">{recommendationStatus}</p>
          )}
          {recommendations.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {recommendations.map((row) => (
                <button
                  type="button"
                  key={row.hcpcs_code}
                  onClick={() => {
                    const merged = Array.from(new Set([...hcpcsCodes, row.hcpcs_code]))
                    updateField("hcpcs_codes", merged.join(", "))
                  }}
                  className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-3 py-1 text-[10px] font-semibold text-accent-blue"
                >
                  {row.hcpcs_code}
                  {typeof row.denial_probability === "number" ? ` · ${(row.denial_probability * 100).toFixed(0)}% deny` : ""}
                  {typeof row.avg_reimbursement === "number" ? ` · $${row.avg_reimbursement.toFixed(0)}` : ""}
                </button>
              ))}
            </div>
          )}
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
          Referring Doctor Contact
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel label="Doctor Name" />
            <FieldInput
              value={form.doctor_name}
              onChange={(v) => updateField("doctor_name", v)}
              placeholder="Dr. Jane Doe"
            />
          </div>
          <div>
            <FieldLabel label="Doctor Phone" />
            <FieldInput
              value={form.doctor_phone}
              onChange={(v) => updateField("doctor_phone", v)}
              placeholder="(555) 555-1212"
            />
          </div>
          <div>
            <FieldLabel label="Doctor Fax" />
            <FieldInput
              value={form.doctor_fax}
              onChange={(v) => updateField("doctor_fax", v)}
              placeholder="(555) 555-2121"
            />
          </div>
          <div>
            <FieldLabel label="Doctor Email" />
            <FieldInput
              value={form.doctor_email}
              onChange={(v) => updateField("doctor_email", v)}
              placeholder="clinic@practice.com"
              type="email"
            />
          </div>
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
          {submitSuccess}
          <a href="/intake" className="ml-2 underline underline-offset-2 hover:text-white">
            Open intake board
          </a>
        </div>
      )}

      {tridentUi && (
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 px-4 py-3 text-xs text-slate-200">
          <p className="mb-2 font-semibold uppercase tracking-[0.15em] text-cyan-300/90">Trident (learned signal)</p>
          {tridentUi.status === "loading" && <p className="text-slate-400">Scoring with historical aggregates…</p>}
          {tridentUi.status === "skipped" && <p className="text-slate-400">{tridentUi.reason}</p>}
          {tridentUi.status === "error" && (
            <p className="text-accent-red/90">{tridentUi.message}</p>
          )}
          {tridentUi.status === "ok" && (() => {
            const s = tridentUi.score
            const adj = s.learned_adjustment
            const conf = s.confidence
            const feats = s.features_used
            const { confidenceTier, historyTier } = tridentInterpretation(s)
            return (
              <div className="space-y-2 font-mono text-[11px] leading-relaxed">
                <div className="grid gap-1 sm:grid-cols-2">
                  <span className="text-slate-500">learned_adjustment</span>
                  <span>{typeof adj === "number" ? adj.toFixed(4) : "—"}</span>
                  <span className="text-slate-500">confidence</span>
                  <span>{typeof conf === "number" ? conf.toFixed(3) : "—"}</span>
                  <span className="text-slate-500">features_used</span>
                  <span className="break-all text-slate-300">
                    {Array.isArray(feats) && feats.length ? feats.join(", ") : "—"}
                  </span>
                  {typeof s.denial_probability === "number" && (
                    <>
                      <span className="text-slate-500">denial_probability</span>
                      <span>{s.denial_probability.toFixed(4)}</span>
                    </>
                  )}
                </div>
                <p className="border-t border-white/10 pt-2 text-[11px] text-slate-400">
                  {confidenceTier} · {historyTier}
                </p>
              </div>
            )
          })()}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY_FORM)
            setPayerFilter("")
            setIcd10Filter("")
            setPhysicianFilter("")
            setSwoFile(null)
            setSupportingFiles([])
            setSubmitError(null)
            setSubmitSuccess(null)
            setTridentUi(null)
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
