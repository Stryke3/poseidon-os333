"use client"

import { useMemo, useRef, useState } from "react"

import type { AccountRecord, KanbanCard } from "@/lib/data"

interface LiveIngestDropzoneProps {
  onIngested: (payload: {
    patients: AccountRecord[]
    cards: KanbanCard[]
  }) => void
}

interface IngestResponse {
  error?: string
  detail?: string
  message?: string
  ingestedPatients?: AccountRecord[]
  ingestedCards?: KanbanCard[]
  importResult?: {
    patients_created?: number
    orders_created?: number
  }
}

function messageFromHttpError(
  data: IngestResponse | Record<string, unknown>,
  raw: string,
  status: number,
) {
  for (const key of ["error", "detail", "message"] as const) {
    const v = data[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  const trimmed = raw.trim()
  if (trimmed) return trimmed.slice(0, 800)
  return `Upload failed (${status}).`
}

function isLikelyNetworkFailure(e: unknown) {
  if (e instanceof TypeError) return true
  if (e instanceof DOMException && e.name === "AbortError") return true
  return false
}

export default function LiveIngestDropzone({
  onIngested,
}: LiveIngestDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dropzoneClass = useMemo(
    () =>
      `rounded-[28px] border p-5 transition ${
        dragActive
          ? "border-accent-blue bg-accent-blue/10"
          : "border-white/10 bg-white/5"
      }`,
    [dragActive],
  )

  async function uploadFile(file: File) {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      let res: Response
      try {
        res = await fetch("/api/intake/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        })
      } catch (e) {
        if (isLikelyNetworkFailure(e)) {
          throw new Error(
            "Network error: could not reach the dashboard. Check your connection and try again.",
          )
        }
        throw e instanceof Error ? e : new Error(String(e))
      }

      const raw = await res.text()
      let data: IngestResponse = {}
      try {
        data = raw ? (JSON.parse(raw) as IngestResponse) : {}
      } catch {
        data = {}
      }

      if (!res.ok) {
        throw new Error(messageFromHttpError(data, raw, res.status))
      }

      onIngested({
        patients: data.ingestedPatients || [],
        cards: data.ingestedCards || [],
      })

      setMessage(
        `${data.importResult?.patients_created ?? 0} patients and ${data.importResult?.orders_created ?? 0} orders created from ${file.name}.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live ingest failed.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className={dropzoneClass}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
            Live Ingest
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Drop Intake File
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Upload a CSV or PDF file. CSVs import row-by-row, and PDFs are parsed for patient,
            payer, HCPCS, and diagnosis details before being sent to the live Core import endpoint.
          </p>
        </div>
        <button
          className="w-full rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-200 transition hover:border-accent-blue md:w-auto"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          Choose file
        </button>
      </div>

      <div
        className="mt-5 flex min-h-[180px] items-center justify-center rounded-3xl border border-dashed border-[rgba(40,90,180,0.35)] bg-black/10 px-5 text-center sm:px-6"
        onDragEnter={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragActive(false)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void uploadFile(file)
        }}
      >
        <div>
          <p className="text-base font-semibold text-white">
            {loading ? "Uploading and creating live records..." : "Drag and drop CSV or PDF here"}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Recommended CSV columns: patient name, DOB, member ID, payer, HCPCS, ICD, notes.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void uploadFile(file)
        }}
      />

      {message && (
        <div className="mt-4 rounded-2xl border border-accent-green/30 bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
          {message}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          {error}
        </div>
      )}
    </article>
  )
}
