import { getCodeMappings, getTemplates } from "@/lib/trident-settings"

export const dynamic = "force-dynamic"

export default function TridentSettingsPage() {
  const mappings = getCodeMappings()
  const templates = getTemplates()

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-300 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">Code Conflict Registry</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Product code mappings</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-600">
          Conflicting HCPCS mappings are surfaced here and should require human confirmation before final generation.
        </p>
      </section>

      <section className="grid gap-4">
        {mappings.map((mapping) => (
          <div key={mapping.product_label} className="rounded-3xl border border-slate-300 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold">{mapping.product_label}</h3>
                <p className="text-sm text-slate-600">
                  Canonical HCPCS {mapping.canonical_hcpcs}
                  {mapping.alternatives.length ? ` · alternatives ${mapping.alternatives.join(", ")}` : ""}
                </p>
              </div>
              <div className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">
                {mapping.conflict ? "REQUIRES REVIEW" : "STABLE"}
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">{mapping.notes}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-300 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">Template Versions</p>
        <div className="mt-4 grid gap-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold">{template.name}</span> · {template.family} · {template.procedure_family} ·{" "}
              {template.version}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
