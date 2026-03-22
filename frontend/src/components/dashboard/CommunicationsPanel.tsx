"use client"

import { useState } from "react"

type FeedItem = {
  id?: string
  item_type?: string
  subtype?: string
  title?: string
  body?: string
  order_id?: string | null
  actor_name?: string | null
  created_at?: string
}

type IntegrationStatus = {
  email?: { configured?: boolean; provider?: string | null; from_address?: string | null }
  calendar?: { configured?: boolean; provider?: string | null; calendar_id?: string | null }
  in_app_push?: { configured?: boolean; sources?: string[] }
}

function relativeTime(value?: string) {
  if (!value) return "now"
  const date = new Date(value)
  const diff = Math.round((Date.now() - date.getTime()) / 60000)
  if (Number.isNaN(diff) || diff <= 1) return "now"
  if (diff < 60) return `${diff}m ago`
  const hours = Math.round(diff / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default function CommunicationsPanel({
  initialItems,
  integrations,
}: {
  initialItems: FeedItem[]
  integrations: IntegrationStatus
}) {
  const [items, setItems] = useState(initialItems)
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")

  async function refreshFeed() {
    setRefreshing(true)
    setError("")
    try {
      const res = await fetch("/api/communications/messages", { cache: "no-store" })
      const data = (await res.json().catch(() => ({}))) as { items?: FeedItem[]; error?: string }
      if (!res.ok) {
        throw new Error(data.error || "Unable to refresh feed.")
      }
      setItems(data.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh feed.")
    } finally {
      setRefreshing(false)
    }
  }

  async function sendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    setError("")
    try {
      const res = await fetch("/api/communications/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, channel: "ops", message_type: "note" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Unable to send update.")
      }
      setItems((prev) => [
        {
          id: (data as { id?: string }).id,
          item_type: "message",
          subtype: "note",
          title: "#ops",
          body: message,
          created_at: new Date().toISOString(),
          actor_name: "You",
        },
        ...prev,
      ])
      setMessage("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send update.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Email</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {integrations.email?.configured ? "Connected" : "Not configured"}
          </p>
          <p className="text-xs text-slate-400">{integrations.email?.provider || "Awaiting provider"}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Calendar</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {integrations.calendar?.configured ? "Connected" : "Not configured"}
          </p>
          <p className="text-xs text-slate-400">{integrations.calendar?.provider || "Awaiting provider"}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">In-App Push</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {integrations.in_app_push?.configured ? "Live" : "Offline"}
          </p>
          <p className="text-xs text-slate-400">
            {(integrations.in_app_push?.sources || []).slice(0, 2).join(", ") || "Ops feed"}
          </p>
        </div>
      </div>

      <form className="rounded-2xl border border-white/10 bg-black/10 p-4" onSubmit={sendMessage}>
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent-blue">Ops Channel</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            "Need review on a patient chart.",
            "Tracking exception needs follow-up.",
            "Billing priority updated for today.",
          ].map((preset) => (
            <button
              key={preset}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-slate-300 transition hover:border-accent-blue/40 hover:text-white"
              onClick={() => setMessage(preset)}
              type="button"
            >
              Use preset
            </button>
          ))}
        </div>
        <textarea
          className="mt-3 min-h-[92px] w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-accent-blue"
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Post a team update about an order, tracking exception, or morning priority."
          value={message}
        />
        {error ? <p className="mt-2 text-xs text-accent-red">{error}</p> : null}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">In-app comms for orders, tracking, and updates.</p>
          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200 transition hover:border-accent-blue/40 hover:text-white disabled:opacity-60"
              disabled={refreshing}
              onClick={refreshFeed}
              type="button"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              className="rounded-xl bg-accent-blue px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-[#1459c9] disabled:opacity-60"
              disabled={sending}
              type="submit"
            >
              {sending ? "Sending..." : "Push Update"}
            </button>
          </div>
        </div>
      </form>

      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={`${item.item_type}-${item.id}-${item.created_at}`} className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{item.title || item.subtype || item.item_type}</p>
                <p className="mt-1 text-xs text-slate-300">{item.body || "Update posted."}</p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{relativeTime(item.created_at)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <span>{item.item_type || "feed"}</span>
              {item.actor_name ? <span>{item.actor_name}</span> : null}
              {item.order_id ? <span>Order {item.order_id.slice(0, 8)}</span> : null}
            </div>
          </div>
        ))}
        {!items.length ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-500">
            No communications yet. Tracking, orders, and team updates will appear here.
          </div>
        ) : null}
      </div>
    </div>
  )
}
