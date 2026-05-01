"use client"

import { useEffect, useRef, useState } from "react"

import type { WorkflowStage } from "@/lib/spear-board"

type ReleaseResult = {
  caseId: string | null
  sourceColumn: WorkflowStage | null
  targetColumn: WorkflowStage | null
  commit: boolean
  invalid: boolean
  trigger: "manual" | "auto" | null
}

export function useHoldDropTarget() {
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [sourceColumn, setSourceColumn] = useState<WorkflowStage | null>(null)
  const [targetColumn, setTargetColumn] = useState<WorkflowStage | null>(null)
  const [isOverTarget, setIsOverTarget] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const [isHoldValid, setIsHoldValid] = useState(false)
  const [isInvalidDrop, setIsInvalidDrop] = useState(false)
  const [holdStartedAt, setHoldStartedAt] = useState<number | null>(null)
  const [holdDurationMs, setHoldDurationMs] = useState(900)
  const [autoDropDurationMs] = useState(2500)
  const [autoCommitted, setAutoCommitted] = useState(false)

  const targetValidRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!holdStartedAt || !targetColumn || !isOverTarget || isHoldValid || !targetValidRef.current) return

    const tick = () => {
      const elapsed = Date.now() - holdStartedAt
      const progress = Math.min(1, elapsed / holdDurationMs)
      setHoldProgress(progress)
      if (progress >= 1) {
        setIsHoldValid(true)
        setHoldProgress(1)
      }
      if (elapsed >= autoDropDurationMs) {
        setAutoCommitted(true)
        return
      }
      rafRef.current = window.requestAnimationFrame(tick)
    }

    rafRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
    }
  }, [autoDropDurationMs, holdDurationMs, holdStartedAt, isHoldValid, isOverTarget, targetColumn])

  function clearAnimation() {
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }

  function resetHoldState() {
    clearAnimation()
    targetValidRef.current = false
    setTargetColumn(null)
    setIsOverTarget(false)
    setHoldProgress(0)
    setIsHoldValid(false)
    setHoldStartedAt(null)
    setAutoCommitted(false)
  }

  function startDrag(args: { caseId: string; sourceColumn: WorkflowStage; pointerType: string }) {
    setActiveDragId(args.caseId)
    setSourceColumn(args.sourceColumn)
    setHoldDurationMs(args.pointerType === "touch" ? 1200 : 900)
    setIsInvalidDrop(false)
    resetHoldState()
  }

  function updateTarget(nextTarget: WorkflowStage | null, isValidTarget: boolean) {
    if (!activeDragId) return

    if (!nextTarget) {
      resetHoldState()
      return
    }

    const isNewTarget = nextTarget !== targetColumn
    targetValidRef.current = isValidTarget
    setTargetColumn(nextTarget)
    setIsOverTarget(true)

    if (!isValidTarget) {
      clearAnimation()
      setIsHoldValid(false)
      setHoldProgress(0)
      setHoldStartedAt(null)
      setAutoCommitted(false)
      return
    }

    if (isNewTarget || !holdStartedAt) {
      clearAnimation()
      setIsHoldValid(false)
      setHoldProgress(0)
      setHoldStartedAt(Date.now())
      setAutoCommitted(false)
    }
  }

  function releaseDrag(): ReleaseResult {
    const commit = Boolean(activeDragId && sourceColumn && targetColumn && targetValidRef.current && (isHoldValid || autoCommitted))
    const invalid = Boolean(activeDragId && !commit)
    const result: ReleaseResult = {
      caseId: activeDragId,
      sourceColumn,
      targetColumn,
      commit,
      invalid,
      trigger: commit ? (autoCommitted ? "auto" : "manual") : null,
    }

    setIsInvalidDrop(invalid)
    setActiveDragId(null)
    setSourceColumn(null)
    resetHoldState()

    return result
  }

  function cancelDrag() {
    setIsInvalidDrop(false)
    setActiveDragId(null)
    setSourceColumn(null)
    resetHoldState()
  }

  return {
    activeDragId,
    sourceColumn,
    targetColumn,
    isOverTarget,
    holdProgress,
    isHoldValid,
    isInvalidDrop,
    holdStartedAt,
    holdDurationMs,
    autoDropDurationMs,
    autoCommitted,
    startDrag,
    updateTarget,
    releaseDrag,
    cancelDrag,
  }
}
