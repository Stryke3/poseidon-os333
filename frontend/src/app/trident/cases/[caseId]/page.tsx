import { redirect } from "next/navigation"

import { BlockerList } from "@/components/spear/BlockerList"
import { TridentCaseGenerateAction } from "@/components/trident/TridentCaseGenerateAction"
import { getTridentCaseDetail } from "@/lib/trident-engine"
import { canGenerateCase, getCaseBlockers, nextActionForCase, toSpearBoardCase } from "@/lib/spear-board"

export const dynamic = "force-dynamic"

export default async function TridentCaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>
}) {
  const { caseId } = await params
  const tridentCase = await getTridentCaseDetail(caseId)
  if (!tridentCase) redirect("/trident/cases")

  const blockers = getCaseBlockers(tridentCase)
  const boardCase = toSpearBoardCase(tridentCase)
  const canGenerate = canGenerateCase(tridentCase, blockers)

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <section className="rounded-[32px] border border-white/8 bg-[#15111b] px-6 py-6 text-[#f4f1e8] shadow-[0_24px_64px_rgba(0,0,0,0.2)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#d9eb74]/74">Case review</p>
              <h2 className="mt-3 text-[2.4rem] tracking-[-0.05em]">
                {tridentCase.patient_first_name} {tridentCase.patient_last_name}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {boardCase.caseId} · {boardCase.procedure} · {boardCase.payer}
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-slate-300">
              {boardCase.statusChip}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[30px] border border-white/8 bg-[#efe8da] p-5 text-[#151519] shadow-[0_16px_36px_rgba(10,12,16,0.08)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Focus case</p>
            <div className="mt-4 grid gap-3 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span>Procedure</span>
                <span className="font-medium text-[#151519]">{boardCase.procedure}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Payer</span>
                <span className="font-medium text-[#151519]">{boardCase.payer}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Provider</span>
                <span className="font-medium text-[#151519]">{tridentCase.provider_name || "Missing"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>DOB</span>
                <span className="font-medium text-[#151519]">{tridentCase.dob || "Missing"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Laterality</span>
                <span className="font-medium text-[#151519]">{tridentCase.laterality}</span>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/8 bg-[#efe8da] p-5 text-[#151519] shadow-[0_16px_36px_rgba(10,12,16,0.08)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Extraction trace</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              {tridentCase.extracted_fields.slice(0, 8).map((field) => (
                <li key={field.field_name} className="rounded-[20px] border border-black/6 bg-white/70 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-[#151519]">{field.field_name}</span>
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{Math.round(field.confidence * 100)}%</span>
                  </div>
                  <p className="mt-2 text-slate-600">{field.field_value || "Missing"}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-[30px] border border-white/8 bg-[#efe8da] p-5 text-[#151519] shadow-[0_16px_36px_rgba(10,12,16,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Source documents</p>
              <h3 className="mt-2 text-xl font-semibold">Packet contents</h3>
            </div>
            <span className="text-sm text-slate-500">{tridentCase.source_documents.length} PDFs</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {tridentCase.source_documents.length === 0 ? (
              <p className="rounded-[20px] border border-dashed border-black/8 px-4 py-5 text-sm text-slate-500">No documents uploaded yet.</p>
            ) : (
              tridentCase.source_documents.map((doc) => (
                <div key={doc.id} className="rounded-[20px] border border-black/6 bg-white/70 px-4 py-4 text-sm text-slate-700">
                  <p className="font-medium text-[#151519]">{doc.filename}</p>
                  <p className="mt-1 text-slate-500">{doc.category}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="rounded-[30px] border border-white/8 bg-[#14111a] p-6 text-slate-100 shadow-[0_24px_60px_rgba(0,0,0,0.22)]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">Blockers</p>
            <h3 className="mt-3 text-xl font-semibold text-[#f4f1e8]">Resolve before generation</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{nextActionForCase(tridentCase, blockers)}</p>
          </div>
          <div className="mt-5">
            <BlockerList blockers={blockers} />
          </div>
          <div className="mt-6">
            <TridentCaseGenerateAction caseId={caseId} disabled={!canGenerate} />
          </div>
        </section>
      </aside>
    </div>
  )
}
