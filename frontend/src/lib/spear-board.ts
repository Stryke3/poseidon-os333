import type { TridentCaseDetail } from "@/lib/trident-engine"

export const WORKFLOW_STAGES = ["intake", "extract", "review", "generate"] as const

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number]

export type SpearBlocker = {
  code:
    | "missing_patient"
    | "missing_dob"
    | "missing_provider"
    | "missing_procedure"
    | "missing_laterality"
    | "missing_payer"
    | "missing_order_date"
    | "mixed_patient_packet"
    | "dob_conflict"
    | "procedure_conflict"
    | "code_conflict"
    | "low_confidence_extraction"
  label: string
  source?: string
  reviewAction: string
  severity: "warning" | "blocking"
}

export type SpearActivityEvent = {
  id: string
  caseId: string
  eventType:
    | "case_uploaded"
    | "extraction_started"
    | "extraction_completed"
    | "field_conflict_detected"
    | "manual_override_made"
    | "case_moved"
    | "swo_generated"
    | "addendum_generated"
    | "generation_blocked"
  actor: string
  timestamp: string
  previousState?: WorkflowStage
  nextState?: WorkflowStage
  reason?: string
}

export type SpearBoardCase = {
  id: string
  caseId: string
  patientName: string
  patientInitials: string
  procedure: string
  payer: string
  pdfCount: number
  extractionProgress: number
  blockerType: string | null
  priority: "low" | "medium" | "high"
  status: WorkflowStage
  statusChip: string
  reviewComplete: boolean
  readyToGenerate: boolean
  completedToday: boolean
  nextAction: string
  blockers: SpearBlocker[]
  generatedDocumentTypes: string[]
  sourceDocuments: Array<{
    id: string
    filename: string
    category: string
  }>
  generatedDocuments: Array<{
    id: string
    type: string
    createdAt: string | null
  }>
  provider: string | null
  dob: string | null
  orderDate: string | null
  laterality: string | null
  sourceCount: number
}

export const STAGE_LABELS: Record<WorkflowStage, string> = {
  intake: "Intake",
  extract: "Extract",
  review: "Review",
  generate: "Generate",
}

export function formatCaseId(caseId: string) {
  return caseId.slice(0, 8).toUpperCase()
}

function patientName(detail: TridentCaseDetail) {
  const name = `${detail.patient_first_name} ${detail.patient_last_name}`.trim()
  return name || "Unassigned patient"
}

function patientInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  if (!parts.length) return "NA"
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
}

function sourceForField(detail: TridentCaseDetail, fieldName: string) {
  const field = detail.extracted_fields.find((entry) => entry.field_name === fieldName)
  if (!field?.source_document_id) return field ? "Text layer" : undefined
  return `Doc ${field.source_document_id.slice(0, 6)}`
}

function hasLowConfidenceExtraction(detail: TridentCaseDetail) {
  return detail.extracted_fields.some((field) => field.requires_review || field.confidence < 0.7)
}

function requiresLaterality(detail: TridentCaseDetail) {
  return detail.procedure_family === "TKA" || detail.procedure_family === "THA"
}

export function getCaseBlockers(detail: TridentCaseDetail): SpearBlocker[] {
  const blockers: SpearBlocker[] = []
  const add = (blocker: SpearBlocker) => blockers.push(blocker)
  const fullName = patientName(detail)

  if (fullName === "Unassigned patient") {
    add({
      code: "missing_patient",
      label: "Missing patient name",
      source: sourceForField(detail, "patient_first_name"),
      reviewAction: "Review",
      severity: "blocking",
    })
  }
  if (!detail.dob) {
    add({
      code: "missing_dob",
      label: "Missing DOB",
      source: sourceForField(detail, "dob"),
      reviewAction: "Review",
      severity: "blocking",
    })
  }
  if (!detail.provider_name) {
    add({
      code: "missing_provider",
      label: "Missing provider",
      source: sourceForField(detail, "provider_name"),
      reviewAction: "Review",
      severity: "blocking",
    })
  }
  if (!detail.procedure_name && detail.procedure_family === "other") {
    add({
      code: "missing_procedure",
      label: "Missing procedure",
      source: sourceForField(detail, "procedure_family"),
      reviewAction: "Review",
      severity: "blocking",
    })
  }
  if (requiresLaterality(detail) && (!detail.laterality || detail.laterality === "unknown")) {
    add({
      code: "missing_laterality",
      label: "Missing laterality",
      source: sourceForField(detail, "laterality"),
      reviewAction: "Review",
      severity: "blocking",
    })
  }
  if (!detail.primary_insurance) {
    add({
      code: "missing_payer",
      label: "Missing payer",
      source: sourceForField(detail, "primary_insurance"),
      reviewAction: "Review",
      severity: "blocking",
    })
  }
  if (!detail.order_date) {
    add({
      code: "missing_order_date",
      label: "Missing order date",
      source: "Order metadata",
      reviewAction: "Review",
      severity: "blocking",
    })
  }

  const reviewText = [...detail.review_flags, ...detail.rule_hits.map((hit) => `${hit.rule_name} ${hit.message}`)].join(" ").toLowerCase()

  if (reviewText.includes("mixed-patient") || reviewText.includes("mixed patient")) {
    add({
      code: "mixed_patient_packet",
      label: "Mixed-patient packet",
      source: "Packet review",
      reviewAction: "Review",
      severity: "blocking",
    })
  }
  if (reviewText.includes("dob conflict")) {
    add({
      code: "dob_conflict",
      label: "Unresolved DOB conflict",
      source: "Extraction trace",
      reviewAction: "Review",
      severity: "blocking",
    })
  }
  if (reviewText.includes("procedure") && reviewText.includes("conflict")) {
    add({
      code: "procedure_conflict",
      label: "Procedure or laterality conflict",
      source: "Rule engine",
      reviewAction: "Review",
      severity: "blocking",
    })
  }
  if (detail.rule_hits.some((hit) => hit.rule_name.includes("conflict") || hit.message.toLowerCase().includes("conflict"))) {
    add({
      code: "code_conflict",
      label: "Code conflict",
      source: "Rules engine",
      reviewAction: "Review",
      severity: "blocking",
    })
  }
  if (hasLowConfidenceExtraction(detail)) {
    add({
      code: "low_confidence_extraction",
      label: "Low confidence extraction",
      source: "Extraction engine",
      reviewAction: "Review",
      severity: "warning",
    })
  }

  return blockers.filter((blocker, index, list) => list.findIndex((item) => item.code === blocker.code) === index)
}

export function getExtractionProgress(detail: TridentCaseDetail) {
  const tracked = ["patient_first_name", "patient_last_name", "dob", "provider_name", "procedure_family", "laterality", "primary_insurance"]
  const populated = tracked.filter((fieldName) => {
    const field = detail.extracted_fields.find((entry) => entry.field_name === fieldName)
    return Boolean(field?.field_value)
  }).length
  return Math.max(12, Math.min(100, Math.round((populated / tracked.length) * 100)))
}

export function canGenerateCase(detail: TridentCaseDetail, blockers = getCaseBlockers(detail)) {
  return !blockers.some((blocker) => blocker.severity === "blocking")
}

function inferStage(detail: TridentCaseDetail, blockers: SpearBlocker[], extractionProgress: number): WorkflowStage {
  if (!detail.source_documents.length) return "intake"
  const hasGeneratedPacket = detail.generated_documents.some((doc) =>
    ["SWO", "POD", "ADDENDUM"].includes(doc.type),
  )
  if (hasGeneratedPacket) return "generate"
  if (blockers.some((blocker) => blocker.severity === "blocking")) return "review"
  if (extractionProgress < 84) return "extract"
  if (blockers.length) return "review"
  return "review"
}

function blockerType(blockers: SpearBlocker[]) {
  if (!blockers.length) return null
  return blockers[0].label
}

function priorityFor(blockers: SpearBlocker[]) {
  if (blockers.some((blocker) => blocker.severity === "blocking")) return "high"
  if (blockers.length) return "medium"
  return "low"
}

export function nextActionForCase(detail: TridentCaseDetail, blockers = getCaseBlockers(detail)) {
  if (!detail.source_documents.length) return "Upload additional documents"
  if (getExtractionProgress(detail) < 84) return "Run extraction"
  if (blockers.some((blocker) => blocker.code === "code_conflict")) return "Resolve code conflict"
  if (blockers.length) return "Review missing fields"
  if (canGenerateCase(detail, blockers)) return "Generate SWO + Addendum"
  return "Review missing fields"
}

export function toSpearBoardCase(detail: TridentCaseDetail): SpearBoardCase {
  const blockers = getCaseBlockers(detail)
  const extractionProgress = getExtractionProgress(detail)
  const status = inferStage(detail, blockers, extractionProgress)
  const fullName = patientName(detail)
  const readyToGenerate = canGenerateCase(detail, blockers)
  const reviewComplete = blockers.filter((blocker) => blocker.severity === "blocking").length === 0 && extractionProgress >= 84

  return {
    id: detail.id,
    caseId: formatCaseId(detail.id),
    patientName: fullName,
    patientInitials: patientInitials(fullName),
    procedure: detail.procedure_name || detail.procedure_family.toUpperCase(),
    payer: detail.primary_insurance || "Payer missing",
    pdfCount: detail.source_documents.length,
    extractionProgress,
    blockerType: blockerType(blockers),
    priority: priorityFor(blockers),
    status,
    statusChip:
      status === "intake"
        ? "New"
        : status === "extract"
          ? "Extracting"
          : status === "review"
            ? blockers.length
              ? "Attention"
              : "Review"
            : "Ready",
    reviewComplete,
    readyToGenerate,
    completedToday: detail.generated_documents.length > 0,
    nextAction: nextActionForCase(detail, blockers),
    blockers,
    generatedDocumentTypes: detail.generated_documents.map((doc) => doc.type),
    sourceDocuments: detail.source_documents.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      category: doc.category,
    })),
    generatedDocuments: detail.generated_documents.map((doc) => ({
      id: doc.id,
      type: doc.type,
      createdAt: doc.created_at,
    })),
    provider: detail.provider_name,
    dob: detail.dob,
    orderDate: detail.order_date,
    laterality: detail.laterality,
    sourceCount: detail.source_documents.length,
  }
}

export function getStatusChip(status: WorkflowStage, blockers: SpearBlocker[]) {
  if (status === "intake") return "New"
  if (status === "extract") return "Extracting"
  if (status === "review") return blockers.length ? "Attention" : "Review"
  return "Ready"
}

export function isValidStageTransition(caseItem: SpearBoardCase, toStatus: WorkflowStage) {
  if (caseItem.status === toStatus) return false
  if (toStatus === "generate" && caseItem.blockers.some((blocker) => blocker.severity === "blocking")) return false

  if (caseItem.status === "intake") return toStatus === "extract"
  if (caseItem.status === "extract") return toStatus === "review" || (toStatus === "generate" && caseItem.reviewComplete && caseItem.readyToGenerate)
  if (caseItem.status === "review") return toStatus === "extract" || (toStatus === "generate" && caseItem.readyToGenerate)
  if (caseItem.status === "generate") return toStatus === "review"
  return false
}

export function createInitialActivityEvents(cases: SpearBoardCase[]): SpearActivityEvent[] {
  const now = new Date().toISOString()

  return cases.flatMap((caseItem) => {
    const events: SpearActivityEvent[] = [
      {
        id: `${caseItem.id}-uploaded`,
        caseId: caseItem.id,
        eventType: "case_uploaded",
        actor: "system",
        timestamp: now,
        nextState: "intake",
      },
    ]

    if (caseItem.status !== "intake") {
      events.push({
        id: `${caseItem.id}-started`,
        caseId: caseItem.id,
        eventType: "extraction_started",
        actor: "system",
        timestamp: now,
        previousState: "intake",
        nextState: "extract",
      })
      events.push({
        id: `${caseItem.id}-completed`,
        caseId: caseItem.id,
        eventType: "extraction_completed",
        actor: "system",
        timestamp: now,
        previousState: "intake",
        nextState: "extract",
      })
    }

    if (caseItem.blockers.length) {
      events.push({
        id: `${caseItem.id}-blocked`,
        caseId: caseItem.id,
        eventType: "field_conflict_detected",
        actor: "rules",
        timestamp: now,
        previousState: "extract",
        nextState: "review",
        reason: caseItem.blockers[0].label,
      })
    }

    if (caseItem.status === "generate") {
      events.push({
        id: `${caseItem.id}-ready`,
        caseId: caseItem.id,
        eventType: "case_moved",
        actor: "system",
        timestamp: now,
        previousState: "review",
        nextState: "generate",
        reason: "eligible_for_generation",
      })
    }

    return events
  })
}

export function moveCase(args: {
  caseId: string
  fromStatus: WorkflowStage
  toStatus: WorkflowStage
  reason: "drag_hold_confirmed"
  timestamp: string
}): SpearActivityEvent {
  return {
    id: `${args.caseId}-${args.fromStatus}-${args.toStatus}-${args.timestamp}`,
    caseId: args.caseId,
    eventType: "case_moved",
    actor: "operator",
    timestamp: args.timestamp,
    previousState: args.fromStatus,
    nextState: args.toStatus,
    reason: args.reason,
  }
}

export function formatActivityTimestamp(timestamp: string) {
  const date = new Date(timestamp)
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}
