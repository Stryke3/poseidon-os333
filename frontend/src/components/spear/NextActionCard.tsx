import { GenerateDocumentsButton } from "@/components/spear/GenerateDocumentsButton"

export function NextActionCard({
  action,
  canGenerate,
  onGenerate,
}: {
  action: string
  canGenerate: boolean
  onGenerate: () => void
}) {
  return (
    <section className="rounded-[28px] border border-black/8 bg-[#f5efe3] p-5 shadow-[0_16px_36px_rgba(16,18,22,0.08)]">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Next action</p>
      <h3 className="mt-3 text-lg font-semibold text-[#151519]">{action}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">One next move only. Keep the packet controlled and eligible.</p>
      <div className="mt-5">{canGenerate ? <GenerateDocumentsButton disabled={false} onClick={onGenerate} /> : null}</div>
    </section>
  )
}
