"use client"

import { useState } from "react"

type PublicInquiryFormProps = {
  inquiryType: "contact" | "partner" | "rep-network"
  eyebrow: string
  title: string
  description: string
}

const initialState = {
  name: "",
  email: "",
  company: "",
  phone: "",
  message: "",
  website: "",
}

export default function PublicInquiryForm({
  inquiryType,
  eyebrow,
  title,
  description,
}: PublicInquiryFormProps) {
  const [form, setForm] = useState(initialState)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")

  function updateField(field: keyof typeof initialState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setSuccess("")
    setError("")

    try {
      const res = await fetch("/api/public-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryType,
          ...form,
        }),
      })

      const data = (await res.json().catch(() => ({}))) as { error?: string }

      if (!res.ok) {
        throw new Error(data.error || "Unable to send your inquiry.")
      }

      setForm(initialState)
      setSuccess("Your message was sent to patients@strykefox.com.")
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send your inquiry.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-accent-gold-2/80">
        {eyebrow}
      </p>
      <h3 className="mt-4 font-display text-4xl uppercase leading-none text-white">
        {title}
      </h3>
      <p className="mt-4 text-sm leading-7 text-slate-200/74 sm:text-base">
        {description}
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <input
          className="w-full rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-accent-blue"
          onChange={(event) => updateField("name", event.target.value)}
          placeholder="Full name"
          required
          type="text"
          value={form.name}
        />
        <input
          className="w-full rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-accent-blue"
          onChange={(event) => updateField("email", event.target.value)}
          placeholder="Email address"
          required
          type="email"
          value={form.email}
        />
        <input
          className="w-full rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-accent-blue"
          onChange={(event) => updateField("company", event.target.value)}
          placeholder="Company or organization"
          type="text"
          value={form.company}
        />
        <input
          className="w-full rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-accent-blue"
          onChange={(event) => updateField("phone", event.target.value)}
          placeholder="Phone number"
          type="tel"
          value={form.phone}
        />
        <input
          aria-hidden="true"
          autoComplete="off"
          className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden opacity-0"
          onChange={(event) => updateField("website", event.target.value)}
          tabIndex={-1}
          type="text"
          value={form.website}
        />
        <textarea
          className="min-h-[160px] w-full rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-accent-blue"
          onChange={(event) => updateField("message", event.target.value)}
          placeholder="Tell us what you need."
          required
          value={form.message}
        />
        <button
          className="w-full rounded-2xl bg-accent-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1459c9] disabled:cursor-not-allowed disabled:bg-[#0f3a7a]"
          disabled={loading}
          type="submit"
        >
          {loading ? "Sending..." : "Send Inquiry"}
        </button>
      </form>

      {success ? (
        <p className="mt-4 rounded-2xl border border-accent-green/30 bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
          {success}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-2xl border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          {error}
        </p>
      ) : null}
    </article>
  )
}
