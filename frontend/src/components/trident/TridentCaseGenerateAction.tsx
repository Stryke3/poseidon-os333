"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { GenerateDocumentsButton } from "@/components/spear/GenerateDocumentsButton"
import { DEFAULT_TRIDENT_GENERATE_DOC_TYPES } from "@/lib/trident-generate-defaults"

export function TridentCaseGenerateAction({ caseId, disabled }: { caseId: string; disabled: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: "ok" | "err"; text: string } | null>(null)

  async function onGenerate() {
    setPending(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/trident/cases/${caseId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_types: [...DEFAULT_TRIDENT_GENERATE_DOC_TYPES] }),
      })
      const payload = (await res.json().catch(() => null)) as {
        results?: Array<{ requested_type?: string; status: number; body?: string }>
        error?: string
      } | null
      if (!res.ok) {
        const firstBad = payload?.results?.find((r) => r.status >= 400)
        const msg = firstBad?.body || payload?.error || `Generation failed (${res.status})`
        setFeedback({ tone: "err", text: typeof msg === "string" ? msg : JSON.stringify(msg) })
        return
      }
      setFeedback({ tone: "ok", text: "SWO and POD drafts saved. Refreshing case…" })
      router.refresh()
    } catch (e) {
      setFeedback({ tone: "err", text: e instanceof Error ? e.message : "Generation failed" })
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <GenerateDocumentsButton disabled={disabled || pending} onClick={onGenerate} />
      {feedback ? (
        <p
          className={`mt-3 text-sm leading-6 ${feedback.tone === "ok" ? "text-emerald-300/90" : "text-rose-300/90"}`}
          role="status"
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  )
}
