import Link from "next/link"

import { getCodeMappings, getTemplates } from "@/lib/trident-settings"
import { getSafeServerSession } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function TridentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string }>
}) {
  const { panel } = await searchParams
  const session = await getSafeServerSession()
  const isAdmin = session?.user?.role === "admin"
  const mappings = getCodeMappings()
  const templates = getTemplates()
  const activePanel = panel === "settings" ? "settings" : "rules"

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-white/8 bg-[#15111b] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.2)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#d9eb74]/74">
          {activePanel === "settings" ? "Settings" : "Rules"}
        </p>
        <h2 className="mt-3 text-3xl tracking-[-0.05em] text-[#f5f1e8]">
          {activePanel === "settings" ? "SPEAR settings and generation templates" : "Code conflict registry and generation templates"}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          This surface is limited to review rules and SWO or payer-addendum template controls for SPEAR.
        </p>
        {isAdmin ? (
          <div className="mt-5">
            <Link
              href="/trident/admin/references"
              className="inline-flex rounded-full border border-[#d9eb74]/35 bg-[#d9eb74]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#d9eb74] transition hover:bg-[#d9eb74]/20"
            >
              Admin — payer & provider lists
            </Link>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4">
        {mappings.map((mapping) => (
          <div key={mapping.product_label} className="rounded-[28px] border border-white/8 bg-[#efe8da] p-5 text-[#17141a] shadow-[0_16px_36px_rgba(0,0,0,0.08)]">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold">{mapping.product_label}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Canonical HCPCS {mapping.canonical_hcpcs}
                  {mapping.alternatives.length ? ` · alternatives ${mapping.alternatives.join(", ")}` : ""}
                </p>
              </div>
              <div className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold text-slate-700">
                {mapping.conflict ? "REQUIRES REVIEW" : "STABLE"}
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">{mapping.notes}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[32px] border border-white/8 bg-[#efe8da] p-6 text-[#17141a] shadow-[0_16px_36px_rgba(0,0,0,0.08)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Templates</p>
        <div className="mt-4 grid gap-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-[22px] border border-black/8 bg-white/70 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold">{template.name}</span> · {template.family} · {template.procedure_family} · {template.version}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
