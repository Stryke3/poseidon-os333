"use client"

import { useCallback, useState } from "react"
import Link from "next/link"

const API = "/api/governance"

export default function GovernanceManualsPage() {
  const [payerId, setPayerId] = useState("")
  const [relativePath, setRelativePath] = useState("example/payer-policy.txt")
  const [rawText, setRawText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewJson, setPreviewJson] = useState<unknown>(null)
  const [ingestJson, setIngestJson] = useState<unknown>(null)
  const [listJson, setListJson] = useState<unknown>(null)

  const runPreview = useCallback(async () => {
    const text = rawText.trim()
    if (!text) {
      setError("Paste manual text for preview")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/manuals/extract-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: text }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setPreviewJson(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [rawText])

  const runIngest = useCallback(
    async (persist: boolean) => {
      if (!payerId.trim()) {
        setError("Payer ID required")
        return
      }
      setLoading(true)
      setError(null)
      try {
        const body: Record<string, unknown> = {
          payerId: payerId.trim(),
          persistExtraction: persist,
          title: relativePath,
        }
        if (rawText.trim()) body.rawText = rawText.trim()
        else body.relativePath = relativePath.trim()

        const res = await fetch(`${API}/manuals/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
        }
        setIngestJson(json)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Request failed")
      } finally {
        setLoading(false)
      }
    },
    [payerId, relativePath, rawText],
  )

  const loadList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = payerId.trim() ? `?payerId=${encodeURIComponent(payerId.trim())}` : ""
      const res = await fetch(`${API}/manuals${qs}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`)
      }
      setListJson(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [payerId])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/admin/governance" className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-400 transition hover:border-accent-blue/30 hover:text-white">
          ← Governance hub
        </Link>
      </div>
      <h1 className="font-display text-3xl uppercase tracking-[0.1em] text-white">Manual extraction review</h1>
      <p className="text-sm text-slate-300/95">
        Files resolve under <code className="text-slate-300">services/trident/manuals</code> unless{" "}
        <code className="text-slate-300">TRIDENT_MANUALS_PATH</code> is set on the Availity service.
      </p>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <section className="space-y-2 glass-panel rounded-[20px] p-4">
        <label className="block text-sm text-slate-300/95">Payer ID</label>
        <input
          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-accent-blue/40 text-sm"
          value={payerId}
          onChange={(e) => setPayerId(e.target.value)}
          placeholder="PAYER_X"
        />
        <label className="mt-2 block text-sm text-slate-300/95">Relative path (optional if pasting text)</label>
        <input
          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-accent-blue/40 text-sm"
          value={relativePath}
          onChange={(e) => setRelativePath(e.target.value)}
        />
        <label className="mt-2 block text-sm text-slate-300/95">Raw manual text</label>
        <textarea
          className="min-h-[160px] w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-accent-blue/40 text-sm font-mono"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Paste manual section for preview / inline ingest…"
        />
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void runPreview()}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600 disabled:opacity-50"
          >
            Preview extraction
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runIngest(false)}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600 disabled:opacity-50"
          >
            Ingest (store manual only)
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runIngest(true)}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            Ingest + persist requirements
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadList()}
            className="rounded border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-50"
          >
            List manuals
          </button>
        </div>
      </section>

      {previewJson ? (
        <section>
          <h2 className="text-sm font-medium text-slate-300">Preview</h2>
          <pre className="mt-2 max-h-[400px] overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
            {JSON.stringify(previewJson, null, 2)}
          </pre>
        </section>
      ) : null}
      {ingestJson ? (
        <section>
          <h2 className="text-sm font-medium text-slate-300">Ingest result</h2>
          <pre className="mt-2 max-h-[280px] overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
            {JSON.stringify(ingestJson, null, 2)}
          </pre>
        </section>
      ) : null}
      {listJson ? (
        <section>
          <h2 className="text-sm font-medium text-slate-300">Manuals</h2>
          <pre className="mt-2 max-h-[400px] overflow-auto rounded border border-slate-700 bg-slate-950 p-3 text-xs">
            {JSON.stringify(listJson, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  )
}
