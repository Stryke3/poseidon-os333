import type { SpearCase, StoredArtifact, StoredDocument } from "@/lib/poseidon-store";

export type SpearPrimaryAction =
  | "review_intake"
  | "run_trident_review"
  | "resolve_trident_blockers"
  | "generate_provider_packet"
  | "request_provider_signature"
  | "upload_signed_swo"
  | "generate_billing_packet"
  | "generate_pod"
  | "record_delivery"
  | "stage_tebra"
  | "upload_signed_pod"
  | "finalize_bill_ready"
  | "open_final_packet"
  | "archive_synthetic_test";

export type SpearNextAction = {
  stageLabel: string;
  nextActionLabel: string;
  explanation: string;
  blockerSummary: string;
  primaryAction: SpearPrimaryAction;
  primaryActionEnabled: boolean;
  secondaryActions: SpearPrimaryAction[];
  progressIndex: number;
  blockers: Array<{ category: string; title: string; detail: string; resolution: string }>;
};

export const WORKFLOW_STEPS = [
  "Intake",
  "Trident",
  "Provider Packet",
  "Provider Signature",
  "Fulfillment",
  "Billing Packet",
  "POD",
  "Tebra",
  "Ready to Bill",
];

const STAGE_LABELS: Record<string, string> = {
  created: "Intake Received",
  intake_received: "Intake Received",
  missing_docs: "Missing Documentation",
  trident_review: "Trident Review Needed",
  trident_review_complete: "Trident Complete",
  blocked_missing_fields: "Trident Blocked",
  provider_packet_generated: "Provider Packet Ready",
  provider_signature_requested: "Awaiting Provider Signature",
  signed_swo_received: "Signed SWO Received",
  ready_to_fulfill: "Ready to Fulfill",
  billing_packet_generated: "Billing Packet Generated",
  pod_needed: "POD Needed",
  pod_generated: "POD Generated",
  delivery_recorded: "Delivery Recorded",
  tebra_ready: "Ready for Tebra",
  staged_for_upload: "Tebra Staged",
  signed_pod_received: "Signed POD Received",
  ready_to_bill: "Ready to Bill",
  closed: "Closed",
};

const TEST_PATTERNS = [
  "watermark test",
  "provider packet test",
  "conveyor test patient",
  "deploy test patient",
  "test patient",
  "synthetic",
  "validation",
];

function arr(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

export function getStageLabel(status: unknown) {
  return STAGE_LABELS[String(status || "")] || "Intake Received";
}

export function isSyntheticCase(caseRecord: Record<string, unknown>) {
  if (caseRecord.archived === true || caseRecord.synthetic === true) return true;
  const source = caseRecord.source;
  if (source && typeof source === "object" && "synthetic" in source && (source as { synthetic?: unknown }).synthetic === true) return true;
  const haystack = [
    caseRecord.patient_name,
    caseRecord.patient,
    caseRecord.member_id,
    caseRecord.payer,
    caseRecord.source,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return TEST_PATTERNS.some((pattern) => haystack.includes(pattern));
}

export function isArchivedCase(caseRecord: Record<string, unknown>) {
  return caseRecord.archived === true || Boolean(caseRecord.archived_at);
}

function hasDoc(documents: StoredDocument[], kind: string) {
  return documents.some((doc) => doc.kind === kind);
}

function hasArtifact(artifacts: StoredArtifact[], kind: string) {
  return artifacts.some((artifact) => artifact.kind === kind);
}

function missingFieldBlockers(caseRecord: SpearCase) {
  const blockers: SpearNextAction["blockers"] = [];
  const fields = [
    ["patient_name", "Missing patient information", "Patient name is missing.", "Add the patient name before continuing."],
    ["dob", "Missing patient information", "Patient DOB is missing.", "Add the patient date of birth before continuing."],
    ["payer", "Missing payer information", "Payer name is missing.", "Add the payer before billing review."],
    ["member_id", "Missing payer information", "Member ID is missing.", "Add the insurance member ID before billing review."],
    ["provider", "Missing provider information", "Provider name is missing.", "Add the ordering or referring provider name."],
    ["laterality", "Missing coding information", "Laterality is missing.", "Add laterality so documentation matches the ordered item."],
    ["order_date", "Missing coding information", "Order date is missing.", "Add the order date before packet generation."],
  ];
  for (const [key, category, title, resolution] of fields) {
    if (!String(caseRecord[key] || "").trim()) blockers.push({ category, title, detail: title, resolution });
  }
  if ((caseRecord.provider_registry_status === "npi_required" || caseRecord.provider_registry_incomplete === true) && !String(caseRecord.npi || "").trim()) blockers.push({
    category: "Provider setup required",
    title: "Provider matched — NPI missing from setup.",
    detail: "The provider registry matched this provider, but the saved NPI is missing.",
    resolution: "Open Settings > Providers and add the verified 10-digit NPI before packet generation.",
  });
  if (arr(caseRecord.final_hcpcs || caseRecord.operator_approved_hcpcs).length === 0 && arr(caseRecord.trident_recommended_hcpcs).length === 0) blockers.push({
    category: "Coding review",
    title: "HCPCS to be assigned by Trident.",
    detail: "Intake did not require source HCPCS. Trident must recommend the configured kit code set.",
    resolution: "Run or review Trident coding recommendation.",
  });
  if (arr(caseRecord.icd).length === 0) blockers.push({
    category: "Missing coding information",
    title: "ICD-10 code is missing.",
    detail: "At least one diagnosis pointer is required for billing readiness.",
    resolution: "Add an ICD-10 diagnosis before running packet generation.",
  });
  return blockers;
}

function state(status: string, action: Partial<SpearNextAction>): SpearNextAction {
  return {
    stageLabel: getStageLabel(status),
    nextActionLabel: "Review Case",
    explanation: "Review the case details and complete the next required workflow step.",
    blockerSummary: "No blockers detected.",
    primaryAction: "review_intake",
    primaryActionEnabled: true,
    secondaryActions: [],
    progressIndex: 0,
    blockers: [],
    ...action,
  };
}

export function getSpearNextAction(
  caseRecord: SpearCase,
  documents: StoredDocument[] = [],
  latestReview?: Record<string, unknown> | null,
  artifacts: StoredArtifact[] = [],
): SpearNextAction {
  const status = String(caseRecord.status || "created");
  const missing = missingFieldBlockers(caseRecord);
  const signedSwo = hasDoc(documents, "signed_swo");
  const signedPod = hasDoc(documents, "signed_pod");
  const billingPacket = hasArtifact(artifacts, "billing_packet");
  const pod = hasArtifact(artifacts, "pod");
  const finalPacket = hasArtifact(artifacts, "final_bill_ready_packet");
  const tebraManifest = hasArtifact(artifacts, "tebra_staging_manifest") || String(caseRecord.tebra_status || "") === "staged_not_submitted";

  if (status === "missing_docs" || status === "intake_received" || status === "created") {
    return state(status, {
      nextActionLabel: missing.length ? "Upload Missing Document" : "Run Trident",
      explanation: missing.length ? "Complete missing intake details before Trident can clear the case." : "Intake has enough captured data for Trident review.",
      blockerSummary: missing.length ? `${missing.length} intake field${missing.length === 1 ? "" : "s"} need attention.` : "No intake blockers detected.",
      primaryAction: missing.length ? "review_intake" : "run_trident_review",
      primaryActionEnabled: true,
      blockers: missing,
      progressIndex: 0,
    });
  }

  if (status === "trident_review") {
    return state(status, {
      nextActionLabel: "Run Trident",
      explanation: "Run Trident to verify completeness, coding support, and billing readiness.",
      primaryAction: "run_trident_review",
      progressIndex: 1,
    });
  }

  if (status === "blocked_missing_fields") {
    return state(status, {
      nextActionLabel: "Resolve Trident Blockers",
      explanation: "Trident found required fields missing or incomplete.",
      blockerSummary: missing.length ? `${missing.length} blocker${missing.length === 1 ? "" : "s"} must be resolved.` : "Trident blocked this case. Review recommendations.",
      primaryAction: "resolve_trident_blockers",
      primaryActionEnabled: false,
      blockers: missing.length ? missing : [{ category: "Trident flag", title: "Trident blocked this case.", detail: "The latest Trident review did not pass.", resolution: "Review Trident recommendations and update the case." }],
      progressIndex: 1,
    });
  }

  if (status === "trident_review_complete") {
    return state(status, {
      nextActionLabel: arr(caseRecord.final_hcpcs || caseRecord.operator_approved_hcpcs).length ? "Generate Provider Packet" : "Review Trident Coding",
      explanation: arr(caseRecord.final_hcpcs || caseRecord.operator_approved_hcpcs).length ? "Trident has cleared the case. Generate the coding cover, SWO, and addendum." : "Trident recommended a configured kit. Operator coding approval is required before packet generation.",
      primaryAction: "generate_provider_packet",
      primaryActionEnabled: missing.length === 0 && arr(caseRecord.final_hcpcs || caseRecord.operator_approved_hcpcs).length > 0,
      blockerSummary: missing.length ? "Missing fields still block provider packet generation." : arr(caseRecord.final_hcpcs || caseRecord.operator_approved_hcpcs).length ? "Ready to generate provider packet." : "Coding recommendation needs operator approval.",
      blockers: missing,
      progressIndex: 2,
    });
  }

  if (status === "provider_packet_generated") {
    return state(status, {
      nextActionLabel: "Request Provider Signature",
      explanation: "Provider packet is ready. Record that it has been sent for provider signature.",
      primaryAction: "request_provider_signature",
      progressIndex: 2,
    });
  }

  if (status === "provider_signature_requested") {
    return state(status, {
      nextActionLabel: "Upload Signed SWO",
      explanation: "Upload the signed provider order when returned by the provider.",
      blockerSummary: signedSwo ? "Signed SWO is present." : "Signed SWO has not been received.",
      primaryAction: "upload_signed_swo",
      primaryActionEnabled: !signedSwo,
      blockers: signedSwo ? [] : [{ category: "Awaiting signature", title: "Signed SWO has not been received.", detail: "Billing packet generation requires a signed provider order.", resolution: "Upload the signed SWO returned by the provider." }],
      progressIndex: 3,
    });
  }

  if (status === "signed_swo_received") {
    return state(status, {
      nextActionLabel: "Generate Billing Packet",
      explanation: "Signed SWO is captured. Generate the billing packet.",
      blockerSummary: signedSwo ? "Signed SWO captured." : "Signed SWO document is missing.",
      primaryAction: "generate_billing_packet",
      primaryActionEnabled: signedSwo,
      blockers: signedSwo ? [] : [{ category: "Missing document", title: "Signed SWO document is missing.", detail: "A status indicates signed SWO, but no signed SWO document is stored.", resolution: "Upload the signed SWO again." }],
      progressIndex: 5,
    });
  }

  if (status === "billing_packet_generated") {
    return state(status, {
      nextActionLabel: "Generate POD",
      explanation: "Billing packet is ready. Generate proof of delivery before Tebra staging.",
      primaryAction: "generate_pod",
      primaryActionEnabled: billingPacket,
      blockerSummary: billingPacket ? "Billing packet generated." : "Billing packet artifact is missing.",
      progressIndex: 6,
    });
  }

  if (status === "pod_generated" || status === "pod_needed") {
    return state(status, {
      nextActionLabel: "Record Delivery",
      explanation: "POD has been generated. Record delivery before staging the Tebra packet.",
      primaryAction: "record_delivery",
      primaryActionEnabled: pod,
      blockerSummary: pod ? "POD generated; delivery must be recorded." : "POD artifact is missing.",
      blockers: pod ? [{ category: "Awaiting delivery", title: "Delivery has not been recorded.", detail: "Tebra staging should wait until delivery has been recorded.", resolution: "Record delivery after fulfillment confirms handoff." }] : [{ category: "Missing document", title: "POD is missing.", detail: "Proof of delivery must be generated before recording delivery.", resolution: "Generate the POD." }],
      progressIndex: 6,
    });
  }

  if (status === "delivery_recorded") {
    return state(status, {
      stageLabel: "Delivery Recorded",
      nextActionLabel: "Stage Tebra Packet",
      explanation: "Delivery is recorded. Stage the billing metadata for Tebra import.",
      primaryAction: "stage_tebra",
      primaryActionEnabled: billingPacket,
      blockerSummary: billingPacket ? "Ready to stage Tebra metadata." : "Billing packet is required before Tebra staging.",
      progressIndex: 7,
    });
  }

  if (status === "tebra_ready" || status === "staged_for_upload") {
    return state(status, {
      nextActionLabel: "Upload Signed POD",
      explanation: "Tebra metadata is staged. Upload the patient-signed POD after delivery.",
      primaryAction: "upload_signed_pod",
      primaryActionEnabled: !signedPod,
      blockerSummary: signedPod ? "Signed POD captured." : "Signed POD has not been received.",
      blockers: signedPod ? [] : [{ category: "Awaiting POD", title: "Signed POD has not been received.", detail: "Final bill-ready packet requires a signed POD.", resolution: "Upload the patient-signed proof of delivery." }],
      progressIndex: 7,
    });
  }

  if (status === "signed_pod_received") {
    return state(status, {
      nextActionLabel: "Finalize Bill-Ready Packet",
      explanation: "Signed POD is captured. Finalize the bill-ready packet.",
      primaryAction: "finalize_bill_ready",
      primaryActionEnabled: signedSwo && signedPod && tebraManifest,
      blockerSummary: signedSwo && signedPod && tebraManifest ? "Ready to finalize." : "Signed SWO, signed POD, and Tebra staging are required.",
      blockers: [
        ...(signedSwo ? [] : [{ category: "Missing document", title: "Signed SWO is missing.", detail: "Final packet requires signed SWO.", resolution: "Upload signed SWO." }]),
        ...(signedPod ? [] : [{ category: "Missing document", title: "Signed POD is missing.", detail: "Final packet requires signed POD.", resolution: "Upload signed POD." }]),
        ...(tebraManifest ? [] : [{ category: "Awaiting Tebra staging", title: "Tebra packet has not been staged.", detail: "Final packet requires staged Tebra metadata.", resolution: "Stage the Tebra packet." }]),
      ],
      progressIndex: 8,
    });
  }

  if (status === "ready_to_bill") {
    return state(status, {
      nextActionLabel: "Open Final Packet",
      explanation: "The case is ready to bill. Open the final packet for billing handoff.",
      primaryAction: "open_final_packet",
      primaryActionEnabled: finalPacket,
      blockerSummary: finalPacket ? "Final bill-ready packet is available." : "Final packet artifact is missing.",
      progressIndex: 8,
    });
  }

  return state(status, {
    nextActionLabel: latestReview ? "Review Case" : "Run Trident",
    primaryAction: latestReview ? "review_intake" : "run_trident_review",
    progressIndex: 0,
  });
}

export function formatActionLabel(action: SpearPrimaryAction) {
  const labels: Record<SpearPrimaryAction, string> = {
    review_intake: "Review Intake",
    run_trident_review: "Run Trident",
    resolve_trident_blockers: "Resolve Trident Blockers",
    generate_provider_packet: "Generate Provider Packet",
    request_provider_signature: "Request Provider Signature",
    upload_signed_swo: "Upload Signed SWO",
    generate_billing_packet: "Generate Billing Packet",
    generate_pod: "Generate POD",
    record_delivery: "Record Delivery",
    stage_tebra: "Stage Tebra Packet",
    upload_signed_pod: "Upload Signed POD",
    finalize_bill_ready: "Finalize Bill-Ready Packet",
    open_final_packet: "Open Final Packet",
    archive_synthetic_test: "Archive Synthetic Test",
  };
  return labels[action];
}
