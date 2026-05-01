import { formatActivityTimestamp, type SpearActivityEvent } from "@/lib/spear-board"

const EVENT_LABELS: Record<SpearActivityEvent["eventType"], string> = {
  case_uploaded: "Case uploaded",
  extraction_started: "Extraction started",
  extraction_completed: "Extraction completed",
  field_conflict_detected: "Field conflict detected",
  manual_override_made: "Manual override made",
  case_moved: "Case moved",
  swo_generated: "SWO generated",
  addendum_generated: "Addendum generated",
  generation_blocked: "Generation blocked",
}

export function ActivityPulse({ events }: { events: SpearActivityEvent[] }) {
  return (
    <section className="rounded-[28px] border border-white/8 bg-[#19151e] p-5 text-slate-100">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Activity</p>
        <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">Live</span>
      </div>
      <div className="mt-4 space-y-3">
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet.</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="rounded-2xl border border-white/6 bg-white/[0.03] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-white">{EVENT_LABELS[event.eventType]}</p>
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{formatActivityTimestamp(event.timestamp)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{event.reason || event.actor}</p>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
