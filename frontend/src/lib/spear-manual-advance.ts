import type { SpearCase } from "@/lib/poseidon-store";
import { getCase, listWorkflowEvents, updateCaseAndAppendEvent } from "@/lib/poseidon-store";

export const MANUAL_ADVANCE_ATTESTATION_TEXT =
  "I attest that the signed SWO and proof of delivery for this order exist in Tebra, that I have personally verified them, and that the items billed match the items prescribed and delivered.";

export type ManualAdvanceInput = {
  attest_swo_signed?: boolean;
  attest_pod_on_file?: boolean;
  evidence_location?: string;
  evidence_reference?: string;
  attested_by?: string;
  note?: string;
  ip_address?: string;
};

export type ManualAdvanceResult =
  | { ok: true; status: 200; case: SpearCase; idempotent: boolean; audit_event_id?: string }
  | { ok: false; status: 400 | 404 | 409; error: string; code: string; diff?: HcpcsDiff; case_id?: string };

export type HcpcsDiff = {
  source_hcpcs: string[];
  final_hcpcs: string[];
  only_source: string[];
  only_final: string[];
};

function normalizeCodes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim().toUpperCase()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,\s]+/).map((item) => item.trim().toUpperCase()).filter(Boolean);
  return [];
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort();
}

export function hcpcsDiff(caseRecord: SpearCase): HcpcsDiff {
  const source = uniqueSorted(normalizeCodes(caseRecord.source_hcpcs?.length ? caseRecord.source_hcpcs : caseRecord.hcpcs));
  const final = uniqueSorted(normalizeCodes(caseRecord.final_hcpcs?.length ? caseRecord.final_hcpcs : caseRecord.operator_approved_hcpcs?.length ? caseRecord.operator_approved_hcpcs : caseRecord.hcpcs));
  return {
    source_hcpcs: source,
    final_hcpcs: final,
    only_source: source.filter((code) => !final.includes(code)),
    only_final: final.filter((code) => !source.includes(code)),
  };
}

export function hasHcpcsGuardrailViolation(caseRecord: SpearCase) {
  const diff = hcpcsDiff(caseRecord);
  return diff.only_source.length > 0 || diff.only_final.length > 0;
}

function nonEmptyList(value: unknown) {
  return normalizeCodes(value).length > 0;
}

export async function manualAdvanceCase(caseId: string, input: ManualAdvanceInput): Promise<ManualAdvanceResult> {
  const evidenceReference = String(input.evidence_reference || "").trim();
  const attestedBy = String(input.attested_by || "").trim() || "unknown";

  if (input.attest_swo_signed !== true || input.attest_pod_on_file !== true) {
    return { ok: false, status: 400, code: "attestation_required", error: "Signed SWO and POD attestations are both required.", case_id: caseId };
  }
  if (!evidenceReference) {
    return { ok: false, status: 400, code: "evidence_reference_required", error: "Evidence reference is required.", case_id: caseId };
  }

  const caseRecord = await getCase(caseId);
  if (!caseRecord) {
    return { ok: false, status: 404, code: "case_not_found", error: "Case not found.", case_id: caseId };
  }

  if (caseRecord.status === "ready_to_bill" && caseRecord.billing_status === "ready_to_bill" && caseRecord.pod_status === "attested_external" && caseRecord.tebra_status === "on_file_manual") {
    return { ok: true, status: 200, case: caseRecord, idempotent: true };
  }

  if (String(caseRecord.trident_status || "") !== "pass") {
    return { ok: false, status: 409, code: "trident_not_passed", error: "Manual advance requires trident_status pass.", case_id: caseRecord.id };
  }
  if (Array.isArray(caseRecord.missing_fields) && caseRecord.missing_fields.length > 0) {
    return { ok: false, status: 409, code: "missing_fields", error: `Manual advance blocked. Missing fields: ${caseRecord.missing_fields.join(", ")}.`, case_id: caseRecord.id };
  }

  const diff = hcpcsDiff(caseRecord);
  if (diff.only_source.length || diff.only_final.length || !nonEmptyList(diff.source_hcpcs) || !nonEmptyList(diff.final_hcpcs)) {
    return {
      ok: false,
      status: 409,
      code: "hcpcs_guardrail",
      error: `Manual advance blocked. Final HCPCS must match source HCPCS. Source only: ${diff.only_source.join(", ") || "none"}. Final only: ${diff.only_final.join(", ") || "none"}.`,
      diff,
      case_id: caseRecord.id,
    };
  }

  const existingEvents = await listWorkflowEvents(caseRecord.id);
  const priorManualAdvance = existingEvents.find((event) => event.event_type === "manual_advance_to_billing_attested");
  if (priorManualAdvance) {
    const { case: updated } = await updateCaseAndAppendEvent(caseRecord.id, {
      billing_status: "ready_to_bill",
      pod_status: "attested_external",
      tebra_status: "on_file_manual",
      status: "ready_to_bill",
    }, "manual_advance_to_billing_idempotent", {
      prior_audit_event_id: priorManualAdvance.id,
      evidence_location: "tebra",
      evidence_reference: evidenceReference,
      attested_by: attestedBy,
    });
    return { ok: true, status: 200, case: updated || caseRecord, idempotent: true, audit_event_id: priorManualAdvance.id };
  }

  const payload = {
    attestation_text: MANUAL_ADVANCE_ATTESTATION_TEXT,
    attest_swo_signed: true,
    attest_pod_on_file: true,
    evidence_location: "tebra",
    evidence_reference: evidenceReference,
    attested_by: attestedBy,
    note: String(input.note || "").trim(),
    ip_address: String(input.ip_address || ""),
    coding_snapshot: {
      source_hcpcs: diff.source_hcpcs,
      final_hcpcs: diff.final_hcpcs,
      source_icd: normalizeCodes(caseRecord.source_icd?.length ? caseRecord.source_icd : caseRecord.icd),
      final_icd: normalizeCodes(caseRecord.final_icd?.length ? caseRecord.final_icd : caseRecord.icd),
      coding_status: caseRecord.coding_status,
      hcpcs_status: caseRecord.hcpcs_status,
      trident_status: caseRecord.trident_status,
    },
  };

  const { case: updated, event } = await updateCaseAndAppendEvent(caseRecord.id, {
    billing_status: "ready_to_bill",
    pod_status: "attested_external",
    tebra_status: "on_file_manual",
    status: "ready_to_bill",
  }, "manual_advance_to_billing_attested", payload);

  return { ok: true, status: 200, case: updated || caseRecord, idempotent: false, audit_event_id: event?.id };
}
