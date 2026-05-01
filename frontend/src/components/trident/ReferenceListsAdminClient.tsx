"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

type RefProvider = {
  id: string
  display_name: string
  npi: string | null
  sort_order: number
  active: boolean
}

type RefPayer = {
  id: string
  display_name: string
  external_code: string | null
  sort_order: number
  active: boolean
}

export function ReferenceListsAdminClient({ email }: { email: string }) {
  const [tab, setTab] = useState<"providers" | "payers">("providers")
  const [providers, setProviders] = useState<RefProvider[]>([])
  const [payers, setPayers] = useState<RefPayer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [newProviderName, setNewProviderName] = useState("")
  const [newProviderNpi, setNewProviderNpi] = useState("")
  const [newProviderSort, setNewProviderSort] = useState("200")
  const [newPayerName, setNewPayerName] = useState("")
  const [newPayerCode, setNewPayerCode] = useState("")
  const [newPayerSort, setNewPayerSort] = useState("200")

  const loadAll = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const [pr, py] = await Promise.all([
        fetch("/api/trident/admin/references/providers", { credentials: "include" }),
        fetch("/api/trident/admin/references/payers", { credentials: "include" }),
      ])
      if (!pr.ok) {
        const t = await pr.json().catch(() => ({}))
        throw new Error((t as { error?: string }).error || pr.statusText)
      }
      if (!py.ok) {
        const t = await py.json().catch(() => ({}))
        throw new Error((t as { error?: string }).error || py.statusText)
      }
      setProviders((await pr.json()) as RefProvider[])
      setPayers((await py.json()) as RefPayer[])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lists")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  async function addProvider(e: React.FormEvent) {
    e.preventDefault()
    if (!newProviderName.trim()) return
    setBusyId("new-provider")
    setError(null)
    try {
      const res = await fetch("/api/trident/admin/references/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          display_name: newProviderName.trim(),
          npi: newProviderNpi.trim() || null,
          sort_order: Number.parseInt(newProviderSort, 10) || 0,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string; detail?: string }).error || (data as { detail?: string }).detail || "Save failed")
      setNewProviderName("")
      setNewProviderNpi("")
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusyId(null)
    }
  }

  async function addPayer(e: React.FormEvent) {
    e.preventDefault()
    if (!newPayerName.trim()) return
    setBusyId("new-payer")
    setError(null)
    try {
      const res = await fetch("/api/trident/admin/references/payers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          display_name: newPayerName.trim(),
          external_code: newPayerCode.trim() || null,
          sort_order: Number.parseInt(newPayerSort, 10) || 0,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string; detail?: string }).error || (data as { detail?: string }).detail || "Save failed")
      setNewPayerName("")
      setNewPayerCode("")
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusyId(null)
    }
  }

  async function patchProvider(id: string, patch: Record<string, unknown>) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/trident/admin/references/providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || "Update failed")
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed")
    } finally {
      setBusyId(null)
    }
  }

  async function patchPayer(id: string, patch: Record<string, unknown>) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/trident/admin/references/payers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || "Update failed")
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed")
    } finally {
      setBusyId(null)
    }
  }

  async function deactivateProvider(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/trident/admin/references/providers/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || "Remove failed")
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed")
    } finally {
      setBusyId(null)
    }
  }

  async function deactivatePayer(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/trident/admin/references/payers/${id}`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || "Remove failed")
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 text-[#f4f1e8]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#d9eb74]/70">Admin</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Payer & provider lists</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            Signed in as <span className="text-slate-200">{email}</span>. Same login as SPEAR; only users with Core{" "}
            <span className="font-mono text-[#d9eb74]">admin</span> role may edit these lists.
          </p>
        </div>
        <Link
          href="/trident"
          className="inline-flex w-fit items-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:border-[#d9eb74]/40 hover:text-white"
        >
          ← Back to cases
        </Link>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">{error}</div>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("providers")}
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
            tab === "providers" ? "bg-[#d9eb74] text-[#14111a]" : "border border-white/10 text-slate-400 hover:text-white"
          }`}
        >
          Providers
        </button>
        <button
          type="button"
          onClick={() => setTab("payers")}
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
            tab === "payers" ? "bg-[#d9eb74] text-[#14111a]" : "border border-white/10 text-slate-400 hover:text-white"
          }`}
        >
          Payers
        </button>
        <button
          type="button"
          onClick={() => void loadAll()}
          disabled={loading}
          className="ml-auto rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 hover:text-white disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {tab === "providers" && !loading ? (
        <section className="space-y-6 rounded-[28px] border border-white/10 bg-[#15111b] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <h2 className="text-lg font-semibold">Ordering / prescribing providers</h2>
          <form onSubmit={addProvider} className="grid gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="text-slate-400">Display name</span>
              <input
                value={newProviderName}
                onChange={(e) => setNewProviderName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f0d12] px-3 py-2 text-sm text-white"
                placeholder="Practice or physician name"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-400">NPI (optional)</span>
              <input
                value={newProviderNpi}
                onChange={(e) => setNewProviderNpi(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f0d12] px-3 py-2 text-sm font-mono text-white"
                placeholder="10-digit"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-400">Sort order</span>
              <input
                value={newProviderSort}
                onChange={(e) => setNewProviderSort(e.target.value)}
                type="number"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f0d12] px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busyId === "new-provider"}
                className="rounded-full bg-[#d9eb74] px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#14111a] disabled:opacity-50"
              >
                Add provider
              </button>
            </div>
          </form>
          <ul className="divide-y divide-white/8 rounded-2xl border border-white/8">
            {providers.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-white">{row.display_name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    NPI: {row.npi || "—"} · sort {row.sort_order}{" "}
                    <span className={row.active ? "text-emerald-400" : "text-amber-400"}>
                      {row.active ? "· active" : "· hidden"}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.active ? (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void deactivateProvider(row.id)}
                      className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300 hover:border-rose-400/50 hover:text-rose-200 disabled:opacity-50"
                    >
                      Hide from list
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void patchProvider(row.id, { active: true })}
                      className="rounded-full border border-emerald-500/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "payers" && !loading ? (
        <section className="space-y-6 rounded-[28px] border border-white/10 bg-[#15111b] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
          <h2 className="text-lg font-semibold">Insurance payers</h2>
          <form onSubmit={addPayer} className="grid gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="text-slate-400">Display name</span>
              <input
                value={newPayerName}
                onChange={(e) => setNewPayerName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f0d12] px-3 py-2 text-sm text-white"
                placeholder="Payer name as shown to staff"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-400">External code (optional)</span>
              <input
                value={newPayerCode}
                onChange={(e) => setNewPayerCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f0d12] px-3 py-2 text-sm text-white"
                placeholder="Payer ID / code"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-400">Sort order</span>
              <input
                value={newPayerSort}
                onChange={(e) => setNewPayerSort(e.target.value)}
                type="number"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0f0d12] px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busyId === "new-payer"}
                className="rounded-full bg-[#d9eb74] px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#14111a] disabled:opacity-50"
              >
                Add payer
              </button>
            </div>
          </form>
          <ul className="divide-y divide-white/8 rounded-2xl border border-white/8">
            {payers.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-white">{row.display_name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Code: {row.external_code || "—"} · sort {row.sort_order}{" "}
                    <span className={row.active ? "text-emerald-400" : "text-amber-400"}>
                      {row.active ? "· active" : "· hidden"}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.active ? (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void deactivatePayer(row.id)}
                      className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300 hover:border-rose-400/50 hover:text-rose-200 disabled:opacity-50"
                    >
                      Hide from list
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void patchPayer(row.id, { active: true })}
                      className="rounded-full border border-emerald-500/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
