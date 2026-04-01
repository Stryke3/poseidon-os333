"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function PatientDangerZone({
  patientId,
  patientName,
}: {
  patientId: string
  patientName: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete ${patientName} and linked duplicate intake records? This removes the patient and attached orders from the live system.`,
    )
    if (!confirmed) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/patients/${patientId}`, {
        method: "DELETE",
      })
      const data = (await res.json().catch(() => ({}))) as { detail?: string; error?: string }
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Delete failed")
      }
      router.replace("/")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-red-300">Danger Zone</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={loading}
          className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Deleting..." : "Delete Patient"}
        </button>
        <p className="text-xs text-red-100/80">
          Use for duplicate intake records created by retries.
        </p>
      </div>
      {error ? <p className="mt-2 text-xs text-red-200">{error}</p> : null}
    </div>
  )
}
