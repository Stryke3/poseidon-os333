export type PodDeliveryGuidancePayload = {
  title: string
  subtitle?: string
  disclaimer: string
  sections: Array<{ id: string; title: string; body: string }>
}

export function PodDeliveryGuidancePanel({
  data,
  compact,
}: {
  data?: PodDeliveryGuidancePayload | null
  compact?: boolean
}) {
  if (!data?.sections?.length) return null

  return (
    <div
      className={
        compact
          ? "rounded-xl border border-accent-teal/25 bg-[rgba(13,158,170,0.06)] p-3"
          : "rounded-2xl border border-accent-teal/30 bg-[rgba(13,158,170,0.08)] p-4"
      }
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-accent-teal">POD · CMS</p>
      <h3 className={`mt-1 font-semibold text-white ${compact ? "text-xs" : "text-sm"}`}>{data.title}</h3>
      {data.subtitle ? (
        <p className={`mt-1 text-slate-400 ${compact ? "text-[10px] leading-snug" : "text-xs"}`}>{data.subtitle}</p>
      ) : null}
      <div className={compact ? "mt-3 max-h-64 space-y-3 overflow-y-auto pr-1" : "mt-4 space-y-4"}>
        {data.sections.map((section) => (
          <div key={section.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{section.title}</p>
            <pre
              className={`mt-2 whitespace-pre-wrap font-sans text-slate-200 ${
                compact ? "text-[10px] leading-relaxed" : "text-xs leading-relaxed"
              }`}
            >
              {section.body}
            </pre>
          </div>
        ))}
      </div>
      <p className={`mt-3 italic text-slate-500 ${compact ? "text-[9px] leading-snug" : "text-[11px]"}`}>
        {data.disclaimer}
      </p>
    </div>
  )
}
