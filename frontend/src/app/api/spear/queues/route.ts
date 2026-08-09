import { NextResponse } from "next/server";
import { listCases, type SpearCase } from "@/lib/poseidon-store";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";
import { getSpearNextAction, isArchivedCase, isSyntheticCase } from "@/lib/spear-next-action";

export const dynamic = "force-dynamic";

const QUEUES = [
  {
    key: "hard_packet",
    label: "Hard Packet Build",
    statuses: new Set(["trident_review_complete"]),
  },
  {
    key: "certification",
    label: "Reviewer Certification",
    statuses: new Set(["packet_review_required"]),
  },
  {
    key: "payer_submission",
    label: "Payer Submission",
    statuses: new Set(["reviewer_certified", "submission_queued"]),
  },
  {
    key: "payer_disposition",
    label: "Payer Disposition",
    statuses: new Set(["submission_sent", "delivery_confirmed", "payer_disposition_pending"]),
  },
  {
    key: "provider_signature",
    label: "Provider Signature",
    statuses: new Set(["provider_packet_generated", "provider_signature_requested"]),
  },
  {
    key: "fulfillment",
    label: "Fulfillment / POD",
    statuses: new Set(["ready_to_fulfill", "pod_needed", "pod_generated", "delivery_recorded"]),
  },
  {
    key: "billing",
    label: "Billing Readiness",
    statuses: new Set(["signed_swo_received", "billing_packet_generated", "signed_pod_received", "revenue_support", "tebra_ready", "staged_for_upload"]),
  },
  {
    key: "blocked",
    label: "Blocked",
    statuses: new Set(["missing_docs", "blocked_missing_fields", "blocked_destination_unverified", "denied", "additional_information_requested", "appeal_required"]),
  },
];

function patientSummary(record: SpearCase) {
  const action = getSpearNextAction(record);
  const firstNonEmptyList = (...values: unknown[]) => {
    for (const value of values) {
      if (Array.isArray(value) && value.length) return value;
      if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).filter(Boolean);
    }
    return [];
  };
  const hcpcs = firstNonEmptyList(record.final_hcpcs, record.operator_approved_hcpcs, record.trident_recommended_hcpcs, record.hcpcs, record.source_hcpcs);
  const product = String(record.product || record.order_type || record.recommended_kit_name || record.carepath_name || "").trim()
    || (hcpcs.length ? `Recommended kit: ${hcpcs.join(", ")}` : "");
  return {
    case_id: record.id,
    order_id: record.order_id,
    patient_name: record.patient_name || "",
    dob: record.dob || "",
    payer: record.payer || "",
    member_id: record.member_id || "",
    provider: record.provider || "",
    npi: record.npi || "",
    product,
    hcpcs,
    icd: firstNonEmptyList(record.final_icd, record.operator_approved_icd, record.trident_recommended_icd, record.icd, record.source_icd),
    laterality: record.laterality || "",
    order_date: record.order_date || "",
    status: record.status || "",
    current_stage: action.stageLabel,
    next_action: action.nextActionLabel,
    blocker: action.blockerSummary || "",
    priority: record.priority || "standard",
    updated_at: record.updated_at || record.created_at || "",
  };
}

export async function GET() {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const cases = (await listCases()).filter((record) => !isArchivedCase(record) && !isSyntheticCase(record));
  const queues = QUEUES.map((queue) => {
    const records = cases
      .filter((record) => queue.statuses.has(String(record.status)))
      .map((record) => patientSummary(record));

    return {
      key: queue.key,
      label: queue.label,
      count: records.length,
      cases: records,
    };
  });

  return NextResponse.json({ ok: true, queues });
}
