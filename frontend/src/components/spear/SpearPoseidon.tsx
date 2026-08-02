"use client"

import { useEffect, useRef, useState } from "react"

type Result = {
  file: string
  status: "pending" | "success" | "error"
  detail?: string
}

export function SpearPoseidon() {
  const [queue, setQueue] = useState<Result[]>([])
  const [cases, setCases] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/spear/cases")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => setCases(Array.isArray(data?.cases) ? data.cases : []))
      .catch(() => setCases([]))
  }, [])

  async function ingestFile(file: File): Promise<Result> {
    const fd = new FormData()
    fd.append("file", file)

    try {
      const res = await fetch("/api/ingest/eob", {
        method: "POST",
        body: fd,
      })
      const data = await res.json()

      return {
        file: file.name,
        status: res.ok ? "success" : "error",
        detail: data?.message || data?.error || JSON.stringify(data),
      }
    } catch (error) {
      return { file: file.name, status: "error", detail: String(error) }
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return

    setLoading(true)

    const results: Result[] = Array.from(files).map((file) => ({
      file: file.name,
      status: "pending",
    }))
    setQueue(results)

    for (let i = 0; i < files.length; i += 1) {
      const result = await ingestFile(files[i])
      setQueue((prev) => prev.map((row, idx) => (idx === i ? result : row)))
    }

    setLoading(false)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <p className="mb-1 font-syne text-xs uppercase tracking-widest text-black/40">
          Poseidon Core
        </p>
        <h1 className="font-syne text-3xl font-bold tracking-tight">
          EOB Ingestion
        </h1>
        <p className="mt-2 text-sm text-black/50">
          Load EOB PDFs or 835 EDI files for coding and learning.
        </p>
      </div>

      <div className="mb-8 rounded-lg border border-black/5 bg-black/[0.02] p-4">
        <p className="mb-2 font-syne text-sm font-semibold text-black">Poseidon File Store</p>
        <p className="text-sm text-black/50">
          Stored SPEAR cases: {cases.length}. Intake, metrics, and Trident now read this internal store.
        </p>
      </div>

      <div
        className="mb-8 cursor-pointer rounded-xl border-2 border-dashed border-black/10 p-12 text-center transition-colors hover:border-black/30"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void handleFiles(event.dataTransfer.files)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.edi,.835,.txt"
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <p className="font-syne text-lg font-medium text-black/60">
          {loading ? "Ingesting..." : "Drop EOBs or 835s here"}
        </p>
        <p className="mt-1 text-sm text-black/30">
          PDF, EDI, 835, TXT — batch supported
        </p>
      </div>

      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map((row, index) => (
            <div
              key={`${row.file}-${index}`}
              className="flex items-center justify-between rounded-lg border border-black/5 bg-black/[0.02] px-4 py-3"
            >
              <span className="max-w-xs truncate font-mono text-sm text-black/70">
                {row.file}
              </span>
              <span
                className={`font-syne text-xs font-medium uppercase tracking-wider ${
                  row.status === "success"
                    ? "text-green-600"
                    : row.status === "error"
                      ? "text-red-500"
                      : "text-black/30"
                }`}
              >
                {row.status === "success"
                  ? "Ingested"
                  : row.status === "error"
                    ? `Failed: ${row.detail}`
                    : "Pending..."}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SpearPoseidon
