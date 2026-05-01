export function OperationalCounters({
  totalCases,
  inMotion,
  awaitingAction,
  completedToday,
  synergyScore,
  pulseMessage,
}: {
  totalCases: number
  inMotion: number
  awaitingAction: number
  completedToday: number
  synergyScore: number
  pulseMessage: string
}) {
  const counters = [
    { label: "Total Cases", value: totalCases, accent: "text-[#f4f1e8]" },
    { label: "In Motion", value: inMotion, accent: "text-[#d9eb74]" },
    { label: "Awaiting Action", value: awaitingAction, accent: "text-[#d47a63]" },
    { label: "Completed Today", value: completedToday, accent: "text-[#92c27f]" },
  ]

  return (
    <div className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(23,19,29,0.96),rgba(15,12,20,0.98))] px-4 pb-4 pt-3 shadow-[0_20px_40px_rgba(0,0,0,0.24)]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="mx-auto rounded-[18px] border border-white/10 bg-[#141019] px-5 py-2 text-sm text-slate-300 shadow-[0_10px_24px_rgba(0,0,0,0.24)]">
          System Pulse
        </div>
      </div>
      <div className="mb-4 flex flex-col gap-3 rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-slate-200">{pulseMessage}</p>
        <div className="rounded-full border border-[#d9eb74]/24 bg-[#d9eb74]/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-[#d9eb74]">
          Synergy Score {synergyScore}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {counters.map((counter) => (
          <div
            key={counter.label}
            className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,16,24,0.94),rgba(15,13,20,0.94))] px-4 py-4 shadow-[0_20px_40px_rgba(0,0,0,0.15)]"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">{counter.label}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className={`text-3xl font-semibold ${counter.accent}`}>{counter.value}</p>
              <div className="h-12 w-12 rounded-full border border-white/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_62%)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
