"use client"

import React, { useEffect, useState } from "react"

type MasterData = Record<string, Array<Record<string, unknown>>>

const SECTIONS = [
  ["providers", "Providers"],
  ["facilities", "Facilities"],
  ["payers", "Payers"],
  ["carepaths", "CarePaths"],
  ["kits", "Kits"],
  ["code_sets", "Code Sets"],
] as const

function labelFor(section: string, row: Record<string, unknown>) {
  if (section === "providers") return String(row.display_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || row.id)
  if (section === "facilities") return String(row.canonical_name || row.id)
  if (section === "payers") return String(row.display_name || row.canonical_name || row.id)
  return String(row.name || row.hcpcs || row.id)
}

function sublineFor(section: string, row: Record<string, unknown>) {
  if (section === "providers") return `NPI: ${row.npi || "setup required"} · Specialty: ${row.specialty || "not set"}`
  if (section === "facilities") return `Aliases: ${Array.isArray(row.aliases) ? row.aliases.join(", ") : "none"}`
  if (section === "payers") return `Type: ${row.payer_type || "not set"} · Route: ${row.authorization_route || "not set"} · Destination: ${row.destination_verified === true ? "verified" : "verification required"}`
  if (section === "kits") return `CarePath: ${row.carepath_id || "not linked"} · Components: ${Array.isArray(row.hcpcs_codes) ? row.hcpcs_codes.length : 0}`
  return String(row.description || row.notes || "Configured record")
}

export function SpearMasterDataSettings() {
  const [data, setData] = useState<MasterData>({})
  const [selected, setSelected] = useState("providers")
  const [jsonDraft, setJsonDraft] = useState("")
  const [message, setMessage] = useState("")
  const rows = data[selected] || []

  async function load() {
    const res = await fetch("/api/spear/master-data", { cache: "no-store" })
    const payload = await res.json().catch(() => ({}))
    const master = payload.master_data || {}
    setData(master)
    setJsonDraft(JSON.stringify(master[selected] || [], null, 2))
  }

  useEffect(() => {
    void load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- initial load only; section changes use the local snapshot

  useEffect(() => {
    setJsonDraft(JSON.stringify(data[selected] || [], null, 2))
  }, [selected, data])

  async function saveSection() {
    setMessage("Saving...")
    try {
      const parsed = JSON.parse(jsonDraft || "[]")
      if (!Array.isArray(parsed)) throw new Error("Section JSON must be an array.")
      const next = { ...data, [selected]: parsed }
      const res = await fetch("/api/spear/master-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ master_data: next }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || !payload.ok) throw new Error(payload.error || `Save failed with HTTP ${res.status}`)
      setData(payload.master_data)
      setMessage("Saved.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.")
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>
      <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, background: "#FFFFFF", padding: 10, height: "fit-content" }}>
        {SECTIONS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelected(key)}
            style={{ width: "100%", textAlign: "left", border: "none", borderRadius: 8, background: selected === key ? "#EFF6FF" : "#FFFFFF", color: selected === key ? "#1D4ED8" : "#334155", padding: "10px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, background: "#FFFFFF", padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: "#0F172A" }}>{SECTIONS.find(([key]) => key === selected)?.[1]}</h2>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748B" }}>{rows.length} active/setup record{rows.length === 1 ? "" : "s"}</p>
            </div>
            <button onClick={saveSection} style={{ border: "none", borderRadius: 8, background: "#2563EB", color: "#FFFFFF", padding: "9px 12px", fontSize: 13, fontWeight: 800 }}>Save Section</button>
          </div>
          {message ? <p style={{ margin: "0 0 12px", fontSize: 12, color: message === "Saved." ? "#166534" : "#B45309" }}>{message}</p> : null}
          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            {rows.slice(0, 8).map((row) => (
              <div key={String(row.id || labelFor(selected, row))} style={{ border: "1px solid #F1F5F9", borderRadius: 8, padding: 10, background: row.active === false ? "#F8FAFC" : "#FFFFFF" }}>
                <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 800 }}>{labelFor(selected, row)}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: "#64748B" }}>{sublineFor(selected, row)}</div>
              </div>
            ))}
          </div>
          <textarea
            value={jsonDraft}
            onChange={(event) => setJsonDraft(event.target.value)}
            rows={18}
            spellCheck={false}
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.55, color: "#0F172A", border: "1px solid #CBD5E1", borderRadius: 8, padding: 12 }}
          />
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "#64748B" }}>
            Authorized setup users can add/edit providers, NPIs, aliases, facility relationships, payer aliases, CarePaths, kits, and code-set components here. Do not invent NPIs; leave blank and keep setup status visible until verified.
          </p>
          {selected === "payers" ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 7, padding: 9 }}>Authorization routing requires <code>authorization_route</code>, a current policy reference/effective date, and a submission destination with <code>destination_verified: true</code>. Unverified destinations hard-block packet transmission.</p> : null}
        </div>
      </div>
    </div>
  )
}
