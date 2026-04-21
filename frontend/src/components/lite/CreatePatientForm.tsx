"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export function CreatePatientForm() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [first, setFirst] = useState("")
  const [last, setLast] = useState("")

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const res = await fetch("/api/lite/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: first, last_name: last }),
        credentials: "include",
      })
      if (!res.ok) {
        const t = await res.text()
        alert(t || "Create failed")
        return
      }
      const p = await res.json()
      router.push(`/lite/patients/${p.id}`)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onCreate} className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:border-t-0 sm:pt-0">
      <span className="text-sm font-medium text-slate-700">New patient</span>
      <div className="flex flex-wrap gap-2">
        <input
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          placeholder="First name"
          className="min-w-[120px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <input
          value={last}
          onChange={(e) => setLast(e.target.value)}
          placeholder="Last name"
          className="min-w-[120px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
  )
}
