"use client"

import { CaseCard } from "@/components/spear/CaseCard"
import { HoldDropTarget } from "@/components/spear/HoldDropTarget"
import type { SpearBoardCase, WorkflowStage } from "@/lib/spear-board"

export function WorkflowColumn({
  stage,
  label,
  cases,
  active,
  validTarget,
  invalidTarget,
  holdProgress,
  holdValid,
  activeDragId,
  onCardPointerDown,
  onSelectCase,
  selectedCaseId,
}: {
  stage: WorkflowStage
  label: string
  cases: SpearBoardCase[]
  active: boolean
  validTarget: boolean
  invalidTarget: boolean
  holdProgress: number
  holdValid: boolean
  activeDragId: string | null
  onCardPointerDown: (caseItem: SpearBoardCase, event: React.PointerEvent<HTMLButtonElement>) => void
  onSelectCase: (caseId: string) => void
  selectedCaseId: string | null
}) {
  return (
    <HoldDropTarget
      stage={stage}
      label={label}
      active={active}
      validTarget={validTarget}
      invalidTarget={invalidTarget}
      holdProgress={holdProgress}
      holdValid={holdValid}
      caseCount={cases.length}
    >
      <div className="space-y-3">
        {cases.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-black/8 bg-white/50 px-4 py-8 text-sm text-slate-500">
            Waiting for case movement.
          </div>
        ) : (
          cases.map((caseItem) => (
            <CaseCard
              key={caseItem.id}
              caseItem={caseItem}
              selected={selectedCaseId === caseItem.id}
              dragging={activeDragId === caseItem.id}
              onPointerDown={(event) => onCardPointerDown(caseItem, event)}
              onSelect={() => onSelectCase(caseItem.id)}
            />
          ))
        )}
      </div>
    </HoldDropTarget>
  )
}
