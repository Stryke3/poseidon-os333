"use client"

import { useCallback, useRef, useState } from "react"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type DocSlot = {
  key: string          // "swo" | "cms1500" | "pod" | "patient_id" | "doctors_notes" | "addendum"
  label: string        // "SWO / Detailed Written Order"
  required: boolean
  document?: {
    id?: string
    file_name?: string
    status?: string
    download_url?: string
  } | null
}

type Props = {
  patientId: string
  orderId: string
  slots: DocSlot[]
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DocumentManager({ patientId, orderId, slots: initialSlots }: Props) {
  const [slots, setSlots] = useState<DocSlot[]>(initialSlots)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const activeSlotRef = useRef<string | null>(null)

  const openPicker = useCallback((slotKey: string) => {
    activeSlotRef.current = slotKey
    fileRef.current?.click()
  }, [])

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      const slotKey = activeSlotRef.current
      if (!file || !slotKey) return
      e.target.value = ""
      setUploading(slotKey)
      setError(null)

      try {
        const form = new FormData()
        form.append("doc_type", slotKey)
        form.append("file", file)

        const res = await fetch(
          `/api/patients/${patientId}/orders/${orderId}/documents`,
          { method: "POST", body: form },
        )
        if (!res.ok) throw new Error(`Upload failed (${res.status})`)
        const doc = await res.json()

        setSlots((prev) =>
          prev.map((s) =>
            s.key === slotKey
              ? {
                  ...s,
                  document: {
                    id: doc.id,
                    file_name: doc.file_name || file.name,
                    status: doc.status || "received",
                    download_url: doc.download_url,
                  },
                }
              : s,
          ),
        )
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Upload failed")
      } finally {
        setUploading(null)
      }
    },
    [patientId, orderId],
  )

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.tiff" onChange={handleUpload} />

      {error && (
        <div className="rounded-xl border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
          {error}
        </div>
      )}

      {slots.map((slot) => {
        const attached = !!slot.document?.id
        const isUploading = uploading === slot.key

        return (
          <div
            key={slot.key}
            className={`flex items-center gap-3 rounded-xl border p-3 transition ${
              attached
                ? "border-accent-green/30 bg-accent-green/5"
                : "border-white/10 bg-black/10"
            }`}
          >
            {/* Checkbox indicator */}
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${
                attached
                  ? "border-accent-green bg-accent-green text-black"
                  : "border-white/20 bg-transparent text-transparent"
              }`}
            >
              {attached ? "\u2713" : ""}
            </div>

            {/* Label + file info */}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${attached ? "text-white" : "text-slate-300"}`}>
                {slot.label}
                {slot.required && <span className="ml-1 text-[10px] text-accent-red">REQ</span>}
              </p>
              {attached && slot.document?.file_name && (
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {slot.document.file_name}
                  {slot.document.status && (
                    <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                      {slot.document.status}
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-2">
              {attached && slot.document?.id && (
                <a
                  href={`/api/patients/${patientId}/orders/${orderId}/documents/${slot.document.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 py-1.5 text-xs font-semibold text-accent-blue transition hover:bg-accent-blue/20"
                >
                  View PDF
                </a>
              )}
              <button
                type="button"
                disabled={isUploading}
                onClick={() => openPicker(slot.key)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  isUploading
                    ? "cursor-wait border-white/10 text-slate-500"
                    : attached
                      ? "border-white/10 bg-white/5 text-slate-300 hover:border-accent-blue/30 hover:text-white"
                      : "border-accent-blue/30 bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20"
                }`}
              >
                {isUploading ? "Uploading\u2026" : attached ? "Replace" : "Upload"}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
