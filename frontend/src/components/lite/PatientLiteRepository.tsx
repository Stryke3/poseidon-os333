"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

type Patient = {
  id: string
  first_name: string
  last_name: string
  dob: string | null
  phone: string | null
  email: string | null
  address: string | null
  payer_name: string | null
  member_id: string | null
  ordering_provider: string | null
  diagnosis_codes: string[]
  hcpcs_codes: string[]
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

type UploadRow = {
  id: string
  category: string
  filename: string
  uploaded_at: string | null
}

type GeneratedRow = {
  id: string
  document_type: string
  created_at: string | null
}

const DOC_CATS = [
  "intake",
  "insurance",
  "rx",
  "swo",
  "pod",
  "medical_records",
  "billing",
  "other",
] as const

function codesToInput(codes: string[] | undefined): string {
  if (!codes?.length) return ""
  return codes.join(", ")
}

function parseCodes(s: string): string[] {
  return s
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

export function PatientLiteRepository({
  patient: initial,
  uploads: initialUploads,
  generated: initialGen,
  basePath = "/lite/patients",
  productLabel = "Poseidon Lite",
}: {
  patient: Patient
  uploads: UploadRow[]
  generated: GeneratedRow[]
  basePath?: string
  productLabel?: string
}) {
  const router = useRouter()
  const [patient, setPatient] = useState(initial)
  const [uploads, setUploads] = useState(initialUploads)
  const [generated, setGenerated] = useState(initialGen)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [genBusy, setGenBusy] = useState<string | null>(null)

  const [dxInput, setDxInput] = useState(codesToInput(initial.diagnosis_codes))
  const [hcpcsInput, setHcpcsInput] = useState(codesToInput(initial.hcpcs_codes))

  // Keep client state in sync when the server page re-renders with fresh props (e.g. after router.refresh()).
  useEffect(() => {
    setPatient(initial)
    setUploads(initialUploads)
    setGenerated(initialGen)
    setDxInput(codesToInput(initial.diagnosis_codes))
    setHcpcsInput(codesToInput(initial.hcpcs_codes))
  }, [initial.id, initial.updated_at])

  const refresh = useCallback(async () => {
    const [pr, ur, gr] = await Promise.all([
      fetch(`/api/lite/patients/${patient.id}`, { credentials: "include" }),
      fetch(`/api/lite/patients/${patient.id}/documents`, { credentials: "include" }),
      fetch(`/api/lite/patients/${patient.id}/generated`, { credentials: "include" }),
    ])
    if (pr.ok) {
      const p = await pr.json()
      setPatient(p)
      setDxInput(codesToInput(p.diagnosis_codes))
      setHcpcsInput(codesToInput(p.hcpcs_codes))
    }
    if (ur.ok) setUploads(await ur.json())
    if (gr.ok) setGenerated(await gr.json())
    router.refresh()
  }, [patient.id, router])

  async function saveDemographics(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const form = e.target as HTMLFormElement
      const fd = new FormData(form)
      const body = {
        first_name: String(fd.get("first_name") || ""),
        last_name: String(fd.get("last_name") || ""),
        dob: fd.get("dob") ? String(fd.get("dob")) : null,
        phone: fd.get("phone") ? String(fd.get("phone")) : null,
        email: fd.get("email") ? String(fd.get("email")) : null,
        address: fd.get("address") ? String(fd.get("address")) : null,
      }
      const res = await fetch(`/api/lite/patients/${patient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      })
      if (!res.ok) {
        alert(await res.text())
        return
      }
      const p = await res.json()
      setPatient(p)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function savePayer(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const form = e.target as HTMLFormElement
      const fd = new FormData(form)
      const body = {
        payer_name: fd.get("payer_name") ? String(fd.get("payer_name")) : null,
        member_id: fd.get("member_id") ? String(fd.get("member_id")) : null,
        ordering_provider: fd.get("ordering_provider") ? String(fd.get("ordering_provider")) : null,
      }
      const res = await fetch(`/api/lite/patients/${patient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      })
      if (!res.ok) {
        alert(await res.text())
        return
      }
      const p = await res.json()
      setPatient(p)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function saveCodes(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const body = {
        diagnosis_codes: parseCodes(dxInput),
        hcpcs_codes: parseCodes(hcpcsInput),
      }
      const res = await fetch(`/api/lite/patients/${patient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      })
      if (!res.ok) {
        alert(await res.text())
        return
      }
      const p = await res.json()
      setPatient(p)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function saveNotes(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const form = e.target as HTMLFormElement
      const fd = new FormData(form)
      const body = { notes: fd.get("notes") ? String(fd.get("notes")) : null }
      const res = await fetch(`/api/lite/patients/${patient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      })
      if (!res.ok) {
        alert(await res.text())
        return
      }
      const p = await res.json()
      setPatient(p)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const fd = new FormData(form)
    const file = fd.get("file") as File | null
    const category = fd.get("category") as string
    if (!file?.size) {
      alert("Choose a file")
      return
    }
    setUploading(true)
    try {
      const up = new FormData()
      up.append("category", category)
      up.append("file", file)
      const res = await fetch(`/api/lite/patients/${patient.id}/documents`, {
        method: "POST",
        body: up,
        credentials: "include",
      })
      if (!res.ok) alert(await res.text())
      else {
        form.reset()
        await refresh()
      }
    } finally {
      setUploading(false)
    }
  }

  async function runGenerate(kind: string) {
    setGenBusy(kind)
    try {
      const res = await fetch(`/api/lite/patients/${patient.id}/generate/${kind}`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) alert(await res.text())
      else await refresh()
    } finally {
      setGenBusy(null)
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {patient.first_name} {patient.last_name}
          </h1>
          <p className="text-sm text-slate-500">{productLabel} case · {patient.id}</p>
        </div>
        <Link href={basePath} className="text-sm text-slate-600 hover:text-slate-900">
          ← Back to queue
        </Link>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Demographics</h2>
        <form
          key={`demo-${patient.updated_at || patient.id}`}
          onSubmit={saveDemographics}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm">
            <span className="text-slate-600">First name</span>
            <input
              name="first_name"
              defaultValue={patient.first_name}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Last name</span>
            <input
              name="last_name"
              defaultValue={patient.last_name}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">DOB</span>
            <input
              name="dob"
              type="date"
              defaultValue={patient.dob || ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Phone</span>
            <input
              name="phone"
              defaultValue={patient.phone || ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-600">Email</span>
            <input
              name="email"
              type="email"
              defaultValue={patient.email || ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-600">Address</span>
            <textarea
              name="address"
              rows={2}
              defaultValue={patient.address || ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Save demographics
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Payer / billing</h2>
        <form
          key={`payer-${patient.updated_at || patient.id}`}
          onSubmit={savePayer}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-600">Payer name</span>
            <input
              name="payer_name"
              defaultValue={patient.payer_name || ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Member ID</span>
            <input
              name="member_id"
              defaultValue={patient.member_id || ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Ordering provider</span>
            <input
              name="ordering_provider"
              defaultValue={patient.ordering_provider || ""}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Save payer / provider
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Diagnosis & HCPCS</h2>
        <form onSubmit={saveCodes} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-slate-600">Diagnosis codes (comma-separated)</span>
            <textarea
              value={dxInput}
              onChange={(e) => setDxInput(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">HCPCS codes (comma-separated)</span>
            <textarea
              value={hcpcsInput}
              onChange={(e) => setHcpcsInput(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Save codes
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Notes</h2>
        <form key={`notes-${patient.updated_at || patient.id}`} onSubmit={saveNotes} className="mt-4">
          <textarea
            name="notes"
            rows={4}
            defaultValue={patient.notes || ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Save notes
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Uploaded files</h2>
        <form onSubmit={onUpload} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm">
            <span className="text-slate-600">Category</span>
            <select
              name="category"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              defaultValue="intake"
            >
              {DOC_CATS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:flex-1">
            <span className="text-slate-600">File</span>
            <input name="file" type="file" className="mt-1 block w-full text-sm" />
          </label>
          <button
            type="submit"
            disabled={uploading}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-900 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload document"}
          </button>
        </form>
        <ul className="mt-4 divide-y divide-slate-100">
          {uploads.length === 0 ? (
            <li className="py-2 text-sm text-slate-500">No uploads yet.</li>
          ) : (
            uploads.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className="font-mono text-xs text-slate-500">[{u.category}]</span> {u.filename}
                </span>
                <a
                  href={`/api/lite/patients/${patient.id}/documents/${u.id}/file`}
                  className="text-emerald-700 hover:underline"
                >
                  Download
                </a>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Generate compliance documents</h2>
        <p className="mt-1 text-sm text-slate-600">
          Each run creates a new document and saves it to this patient&apos;s repository.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["swo", "Generate SWO"],
              ["transmittal", "Generate transmittal"],
              ["checklist", "Generate checklist"],
              ["billing-summary", "Generate billing summary"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              disabled={!!genBusy}
              onClick={() => runGenerate(kind)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              {genBusy === kind ? "…" : label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Generated files</h2>
        <ul className="mt-4 divide-y divide-slate-100">
          {generated.length === 0 ? (
            <li className="py-2 text-sm text-slate-500">No generated documents yet.</li>
          ) : (
            generated.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`${basePath}/${patient.id}/generated/${g.id}`} className="font-medium text-slate-900 hover:underline">
                  {g.document_type}
                </Link>
                <span className="text-xs text-slate-500">{g.created_at}</span>
                <div className="flex gap-3">
                  <Link href={`${basePath}/${patient.id}/generated/${g.id}`} className="text-emerald-700 hover:underline">
                    View
                  </Link>
                  <a
                    href={`/api/lite/patients/${patient.id}/generated/${g.id}/file`}
                    className="text-emerald-700 hover:underline"
                  >
                    Download
                  </a>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  )
}
