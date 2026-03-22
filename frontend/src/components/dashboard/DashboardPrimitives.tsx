import type { ReactNode } from "react"

interface SectionCardProps {
  children: ReactNode
  className?: string
}

interface PageShellProps {
  children: ReactNode
  className?: string
  contentClassName?: string
}

interface HeroPanelProps {
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
  aside?: ReactNode
  className?: string
  eyebrowClassName?: string
}

interface SectionHeadingProps {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
}

interface MetricCardProps {
  label: string
  value: string
  supportingText: string
  className?: string
}

function cn(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ")
}

export function PageShell({
  children,
  className,
  contentClassName,
}: PageShellProps) {
  return (
    <main
      className={cn(
        "min-h-screen text-slate-100",
        className,
      )}
    >
      <section
        className={cn(
          "mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 pb-10 pt-4 sm:px-6 sm:pb-12 sm:pt-6 lg:px-8 xl:px-10",
          contentClassName,
        )}
      >
        {children}
      </section>
    </main>
  )
}

export function HeroPanel({
  eyebrow,
  title,
  description,
  actions,
  aside,
  className,
  eyebrowClassName,
}: HeroPanelProps) {
  return (
    <header
      className={cn(
        "glass-panel-strong cockpit-sheen hud-outline rounded-[32px] p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className={cn(
            "mb-3 inline-flex items-center gap-2 rounded-full border border-[rgba(142,197,255,0.35)] bg-[rgba(118,243,255,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-[#a8dcff] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]",
            eyebrowClassName,
          )}>
            {eyebrow}
          </div>
          <h1 className="font-display text-4xl uppercase tracking-[0.1em] text-white drop-shadow-[0_0_24px_rgba(118,243,255,0.12)] sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          {description && (
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300/95 sm:text-base">
              {description}
            </p>
          )}
          {actions && <div className="mt-5 flex flex-wrap gap-3">{actions}</div>}
        </div>
        {aside && <div className="w-full lg:max-w-[460px]">{aside}</div>}
      </div>
    </header>
  )
}

export function SectionCard({ children, className }: SectionCardProps) {
  return (
    <article
      className={cn(
        "glass-panel cockpit-sheen rounded-[30px] p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </article>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: SectionHeadingProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.32em] text-[#8fb5de]">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
          {title}
        </h2>
      </div>
      {(description || action) && (
        <div className="flex flex-col gap-2 md:items-end">
          {description && <p className="text-xs text-slate-400/95">{description}</p>}
          {action}
        </div>
      )}
    </div>
  )
}

export function MetricCard({
  label,
  value,
  supportingText,
  className,
}: MetricCardProps) {
  return (
    <div className={cn("glass-panel rounded-[28px] border p-4", className)}>
      <p className="text-[11px] uppercase tracking-[0.28em] text-[#b2d5ff]">
        {label}
      </p>
      <p className="mt-4 font-display text-4xl text-white drop-shadow-[0_0_18px_rgba(142,197,255,0.12)] sm:text-5xl">{value}</p>
      <p className="mt-2 text-xs text-slate-300/95">{supportingText}</p>
    </div>
  )
}
