"use client"

import { useState } from "react"

type Pathway = "surgical" | "mobility" | "recovery" | "maternity"

const PATHWAYS: { value: Pathway; label: string; desc: string }[] = [
  { value: "surgical", label: "Surgical", desc: "Post-surgical recovery and wound care coordination" },
  { value: "mobility", label: "Mobility", desc: "Mobility aids, DME, and rehabilitation equipment" },
  { value: "recovery", label: "Recovery", desc: "Home recovery kits and chronic condition management" },
  { value: "maternity", label: "Maternity", desc: "Pregnancy and postpartum care coordination" },
]

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]

type FormState = {
  pathway: Pathway | ""
  // Referring physician
  refName: string
  refNpi: string
  refPractice: string
  refPhone: string
  refEmail: string
  // Patient
  patFirst: string
  patLast: string
  patDob: string
  patGender: string
  patPhone: string
  patState: string
  // Insurance
  payerName: string
  memberId: string
  groupNum: string
  relationship: string
  // Clinical
  icd10: string
  hcpcs: string
  notes: string
  // Honeypot
  website: string
}

const blank: FormState = {
  pathway: "",
  refName: "", refNpi: "", refPractice: "", refPhone: "", refEmail: "",
  patFirst: "", patLast: "", patDob: "", patGender: "", patPhone: "", patState: "",
  payerName: "", memberId: "", groupNum: "", relationship: "self",
  icd10: "", hcpcs: "", notes: "",
  website: "",
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-black/15 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-500/60 focus:bg-black/25"

const labelCls = "block text-[10px] font-medium uppercase tracking-[0.28em] text-slate-400 mb-1"

export default function CarePathIntakeForm() {
  const [form, setForm] = useState<FormState>(blank)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")

  const set = (field: keyof FormState, val: string) =>
    setForm((prev) => ({ ...prev, [field]: val }))

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (form.website) return
    setLoading(true)
    setSuccess("")
    setError("")

    try {
      const res = await fetch("/api/carepath-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; referenceId?: string }
      if (!res.ok) throw new Error(data.error || "Submission failed.")
      setForm(blank)
      setSuccess(
        `Referral received${data.referenceId ? ` · Ref #${data.referenceId}` : ""}. Our team will follow up within 24 hours.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Honeypot */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        aria-hidden="true"
        style={{ display: "none" }}
        value={form.website}
        onChange={(e) => set("website", e.target.value)}
      />

      {/* Pathway selection */}
      <div>
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.32em] text-cyan-400/70">
          1 — Select Pathway
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PATHWAYS.map((pw) => (
            <button
              key={pw.value}
              type="button"
              onClick={() => set("pathway", pw.value)}
              className={[
                "rounded-xl border px-3 py-3 text-left transition",
                form.pathway === pw.value
                  ? "border-cyan-500/60 bg-cyan-500/10 text-white"
                  : "border-white/8 bg-white/4 text-slate-400 hover:border-white/20 hover:text-white",
              ].join(" ")}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-[0.1em]">
                {pw.label}
              </span>
              <span className="mt-0.5 block text-[10px] leading-relaxed opacity-70">
                {pw.desc}
              </span>
            </button>
          ))}
        </div>
        {!form.pathway && (
          <input type="text" required className="sr-only" aria-hidden tabIndex={-1} readOnly value="" />
        )}
      </div>

      {/* Referring physician */}
      <div>
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.32em] text-cyan-400/70">
          2 — Referring Physician
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Physician Name *</label>
            <input
              className={inputCls}
              placeholder="Dr. Jane Smith"
              required
              value={form.refName}
              onChange={(e) => set("refName", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>NPI Number *</label>
            <input
              className={inputCls}
              placeholder="1234567890"
              pattern="[0-9]{10}"
              title="10-digit NPI number"
              required
              value={form.refNpi}
              onChange={(e) => set("refNpi", e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>
          <div>
            <label className={labelCls}>Practice / Facility Name *</label>
            <input
              className={inputCls}
              placeholder="Valley Orthopedic Associates"
              required
              value={form.refPractice}
              onChange={(e) => set("refPractice", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Practice Phone *</label>
            <input
              className={inputCls}
              type="tel"
              placeholder="(702) 555-0100"
              required
              value={form.refPhone}
              onChange={(e) => set("refPhone", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Practice Email</label>
            <input
              className={inputCls}
              type="email"
              placeholder="orders@yourpractice.com"
              value={form.refEmail}
              onChange={(e) => set("refEmail", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Patient demographics */}
      <div>
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.32em] text-cyan-400/70">
          3 — Patient Demographics
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>First Name *</label>
            <input
              className={inputCls}
              placeholder="First"
              required
              value={form.patFirst}
              onChange={(e) => set("patFirst", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Last Name *</label>
            <input
              className={inputCls}
              placeholder="Last"
              required
              value={form.patLast}
              onChange={(e) => set("patLast", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Date of Birth *</label>
            <input
              className={inputCls}
              type="date"
              required
              value={form.patDob}
              onChange={(e) => set("patDob", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Gender</label>
            <select
              className={inputCls}
              value={form.patGender}
              onChange={(e) => set("patGender", e.target.value)}
            >
              <option value="">Select</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="U">Unknown / Prefer not to say</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Patient Phone *</label>
            <input
              className={inputCls}
              type="tel"
              placeholder="(702) 555-0100"
              required
              value={form.patPhone}
              onChange={(e) => set("patPhone", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>State *</label>
            <select
              className={inputCls}
              required
              value={form.patState}
              onChange={(e) => set("patState", e.target.value)}
            >
              <option value="">Select State</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Insurance */}
      <div>
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.32em] text-cyan-400/70">
          4 — Insurance
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Payer Name *</label>
            <input
              className={inputCls}
              placeholder="Blue Cross Blue Shield"
              required
              value={form.payerName}
              onChange={(e) => set("payerName", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Member ID *</label>
            <input
              className={inputCls}
              placeholder="XYZ123456789"
              required
              value={form.memberId}
              onChange={(e) => set("memberId", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Group Number</label>
            <input
              className={inputCls}
              placeholder="GRP-00123"
              value={form.groupNum}
              onChange={(e) => set("groupNum", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Subscriber Relationship</label>
            <select
              className={inputCls}
              value={form.relationship}
              onChange={(e) => set("relationship", e.target.value)}
            >
              <option value="self">Self</option>
              <option value="spouse">Spouse</option>
              <option value="child">Child</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* Clinical codes + notes */}
      <div>
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.32em] text-cyan-400/70">
          5 — Clinical &amp; Billing Codes
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>ICD-10 Diagnosis Codes</label>
            <input
              className={inputCls}
              placeholder="M79.3, Z96.641"
              value={form.icd10}
              onChange={(e) => set("icd10", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>HCPCS / CPT Codes</label>
            <input
              className={inputCls}
              placeholder="E0181, L1833"
              value={form.hcpcs}
              onChange={(e) => set("hcpcs", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Clinical Notes</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={3}
              placeholder="Procedure date, special instructions, urgency, prior auth status..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={2000}
            />
          </div>
        </div>
      </div>

      {success && (
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/8 px-4 py-3 text-sm text-cyan-300">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !form.pathway}
        className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white shadow-[0_6px_24px_rgba(6,182,212,0.25)] transition hover:shadow-[0_10px_36px_rgba(6,182,212,0.4)] hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Submitting Referral…" : "Submit CarePath Referral →"}
      </button>

      <p className="text-center text-[10px] text-slate-600">
        NPI: 1821959420 · Compliance-First · HIPAA-Aware Transmission · Verify · Document · Deliver
      </p>
    </form>
  )
}
