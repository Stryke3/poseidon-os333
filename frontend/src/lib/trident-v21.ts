import { createHash, randomUUID } from "node:crypto";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { SpearCase, StoredArtifact, StoredDocument } from "@/lib/poseidon-store";

export type ProceduralRoute =
  | "prospective_authorization"
  | "concurrent_review"
  | "retro_authorization"
  | "retrospective_claims_review"
  | "appeal"
  | "no_authorization_required";

type EvidenceStatus = "pass" | "deficiency" | "reviewer_needed";

function arr(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function uniq(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function text(value: unknown, fallback = "") {
  return String(value || fallback).trim();
}

function todayIso() {
  return new Date().toISOString();
}

function packetTitle(route: ProceduralRoute) {
  const titles: Record<ProceduralRoute, string> = {
    prospective_authorization: "Prior Authorization Request",
    concurrent_review: "Concurrent Review Submission",
    retro_authorization: "Retrospective Authorization Request",
    retrospective_claims_review: "Retrospective Claims Review Submission",
    appeal: "Claim Appeal Submission",
    no_authorization_required: "No Authorization Required Verification File",
  };
  return titles[route];
}

function normalizeDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function determineProceduralRoute(caseRecord: SpearCase): { route: ProceduralRoute; title: string; rationale: string } {
  const explicit = text(caseRecord.procedural_posture || caseRecord.route).toLowerCase();
  if (explicit.includes("appeal") || text(caseRecord.payer_disposition_status).toLowerCase().includes("denied")) {
    return { route: "appeal", title: packetTitle("appeal"), rationale: "Adverse determination or appeal posture selected." };
  }
  if (explicit.includes("concurrent")) return { route: "concurrent_review", title: packetTitle("concurrent_review"), rationale: "Active treatment episode requires concurrent review." };
  if (explicit.includes("retro") && explicit.includes("auth")) return { route: "retro_authorization", title: packetTitle("retro_authorization"), rationale: "Post-DOS payer route accepts retro authorization." };
  if (explicit.includes("claim")) return { route: "retrospective_claims_review", title: packetTitle("retrospective_claims_review"), rationale: "Post-DOS route requires claims review." };
  if (explicit.includes("no auth")) return { route: "no_authorization_required", title: packetTitle("no_authorization_required"), rationale: "No-authorization-required route requires affirmative verification evidence." };

  const dos = normalizeDate(caseRecord.date_of_service || caseRecord.order_date);
  if (dos && dos.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    return { route: "retrospective_claims_review", title: packetTitle("retrospective_claims_review"), rationale: "DOS is in the past and no retro-authorization acceptance was documented." };
  }
  return { route: "prospective_authorization", title: packetTitle("prospective_authorization"), rationale: "DOS is prospective or unspecified; prior authorization is the default route." };
}

export function buildLineItems(caseRecord: SpearCase, documents: StoredDocument[]) {
  const baseHcpcs = arr(caseRecord.final_hcpcs || caseRecord.operator_approved_hcpcs || caseRecord.trident_recommended_hcpcs || caseRecord.hcpcs);
  const icd = uniq([
    ...arr(caseRecord.final_icd || caseRecord.operator_approved_icd || caseRecord.trident_recommended_icd || caseRecord.icd),
    ...arr(caseRecord.source_icd),
  ]);
  const hasSource = documents.some((doc) => doc.kind === "source_intake");
  const hasSignedOrder = documents.some((doc) => doc.kind === "signed_swo");
  const payerText = [caseRecord.payer, caseRecord.canonical_payer, caseRecord.raw_payer].map((value) => text(value).toLowerCase()).join(" ");
  const payerRestricted = payerText.includes("medicare") || payerText.includes("medicaid") || payerText.includes("cms");
  const hcpcs = uniq([
    ...baseHcpcs.filter((code) => !payerRestricted || code !== "E0676"),
    ...(payerRestricted ? [] : ["E0676"]),
  ]);
  return hcpcs.map((code, index) => {
    const diagnosis = icd[index] || icd[0] || "";
    const status: EvidenceStatus = diagnosis && (hasSource || hasSignedOrder) ? "pass" : "deficiency";
    return {
      id: `line_${index + 1}_${code}`,
      hcpcs: code,
      diagnosis,
      coverage_requirement: code === "E0676"
        ? "E0676 provider addendum/sign-off, item-specific medical necessity, NOC narrative where payer requires, and payer-specific coverage review."
        : "Documented order, diagnosis support, and item-specific medical necessity.",
      evidence_satisfying_requirement: hasSignedOrder ? "Signed SWO and intake evidence present." : hasSource ? "Source intake evidence present; signed SWO still required for downstream billing." : "No supporting source document stored.",
      exhibit: hasSignedOrder ? "Exhibit A" : hasSource ? "Exhibit B" : "Unmapped",
      page_location: code === "E0676" ? "Provider packet / E0676 addendum" : hasSignedOrder ? "Provider packet / signed SWO" : hasSource ? "Source intake document" : "Missing",
      status,
      policy_crosswalk: {
        payer: caseRecord.payer || "Unknown payer",
        plan_product: caseRecord.plan_product || caseRecord.canonical_payer || "Plan/product not captured",
        state_or_jurisdiction: caseRecord.state || "Not captured",
        applicable_policy: `${caseRecord.payer || "Payer"} ${code} coverage policy`,
        policy_version_or_effective_date: caseRecord.policy_effective_date || "Requires verification",
        benefit_category: "DME/medical benefit unless payer policy states otherwise",
        documentation_requirement: code === "E0676" ? "Signed E0676 addendum, provider order, medical necessity, payer policy review, and NOC narrative if billed." : "Order, diagnosis support, medical necessity, and item evidence.",
        physician_order_requirement: "Signed physician order/SWO required before fulfillment and billing.",
        medical_necessity_requirement: code === "E0676" ? "Document post-operative DVT risk, edema control need, recovery support need, or payer-specific medical necessity basis." : "Functional limitation or recovery need documented in submitted record.",
        supporting_exhibit_and_page: code === "E0676" ? "E0676 provider addendum / sign-off section." : hasSource ? "Evidence index references submitted source document." : "Missing evidence",
        source_reference: caseRecord.policy_source || "Internal payer library/operator verification required",
        reviewer_conclusion: status === "pass" ? "Criteria mapped for reviewer certification." : "Deficiency blocks certification.",
      },
      medical_necessity_narrative: code === "E0676"
        ? `E0676 is included for provider review/sign-off for ${caseRecord.patient_name || "the patient"} with diagnosis ${diagnosis || "not captured"}. The signed addendum must document medical necessity for DVT prophylaxis, edema control, and recovery support before any payer-specific billing release.`
        : `${code} is requested for ${caseRecord.patient_name || "the patient"} with diagnosis ${diagnosis || "not captured"}. The submitted record must support the functional deficit, physician assessment, treatment objective, and expected clinical benefit before release.`,
    };
  });
}

export function buildTridentV21Review(caseRecord: SpearCase, documents: StoredDocument[]) {
  const route = determineProceduralRoute(caseRecord);
  const lines = buildLineItems(caseRecord, documents);
  const missing = [
    ["patient_name", caseRecord.patient_name],
    ["dob", caseRecord.dob],
    ["payer", caseRecord.payer],
    ["member_id", caseRecord.member_id],
    ["provider", caseRecord.provider],
    ["npi", caseRecord.npi],
    ["hcpcs", lines.length ? "present" : ""],
    ["icd", arr(caseRecord.icd).length ? "present" : ""],
    ["order_date", caseRecord.order_date],
  ].filter(([, value]) => !text(value)).map(([field]) => field);
  const deficiencies = lines.filter((line) => line.status !== "pass").map((line) => `${line.hcpcs}: ${line.evidence_satisfying_requirement}`);
  const destination = text(caseRecord.payer_submission_destination || caseRecord.payer_fax || caseRecord.authorization_fax);
  const destinationVerified = Boolean(caseRecord.destination_verified_at && destination);
  const noAuthVerified = route.route !== "no_authorization_required" || Boolean(caseRecord.no_auth_required_evidence);
  const reviewStatus = missing.length || deficiencies.length || !destinationVerified || !noAuthVerified ? "blocked" : "packet_review_required";
  return {
    trident_version: "2.1",
    case_id: caseRecord.id,
    route: route.route,
    packet_title: route.title,
    route_rationale: route.rationale,
    line_items: lines,
    missing_fields: missing,
    deficiencies,
    destination_verified: destinationVerified,
    destination,
    no_authorization_required_verified: noAuthVerified,
    review_status: reviewStatus,
    certification_required: reviewStatus === "packet_review_required",
    created_at: todayIso(),
  };
}

function wrap(input: string, max = 88) {
  const words = input.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function buildTridentHardPacket(caseRecord: SpearCase, review: ReturnType<typeof buildTridentV21Review>) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages: Array<{ title: string; lines: string[] }> = [
    { title: "Payer Fax or Submission Cover Sheet", lines: [`Packet Title: ${review.packet_title}`, `Destination: ${review.destination || "BLOCKED - destination unverified"}`, `Route: ${review.route}`, `Patient: ${caseRecord.patient_name}`, `DOB: ${caseRecord.dob}`] },
    { title: "TRIDENT Submission Cover Page", lines: [`TRIDENT v2.1`, `Case: ${caseRecord.id}`, `Order: ${caseRecord.order_id}`, `Generated: ${todayIso()}`] },
    { title: "Administrative Routing Determination", lines: [`Route: ${review.route}`, `Title: ${review.packet_title}`, `Rationale: ${review.route_rationale}`] },
    { title: "Patient, Payer, Provider, Supplier, DOS, Diagnosis, HCPCS Summary", lines: [`Patient: ${caseRecord.patient_name}`, `DOB: ${caseRecord.dob}`, `Payer: ${caseRecord.payer}`, `Member ID: ${caseRecord.member_id}`, `Provider: ${caseRecord.provider}`, `NPI: ${caseRecord.npi}`, `DOS/Order Date: ${caseRecord.date_of_service || caseRecord.order_date}`, `HCPCS: ${review.line_items.map((line) => line.hcpcs).join(", ")}`, `ICD-10: ${arr(caseRecord.icd).join(", ")}`] },
    { title: "Eligibility and Benefit Verification Summary", lines: [`Eligibility: ${caseRecord.eligibility_status || "Requires verification"}`, `Benefits: ${caseRecord.benefit_status || "Requires verification"}`, `Verification source: ${caseRecord.eligibility_source || "Not captured"}`] },
    { title: "Coverage Criteria Matrix", lines: review.line_items.flatMap((line) => [`${line.hcpcs} / ${line.diagnosis}: ${line.status}`, `Requirement: ${line.coverage_requirement}`, `Evidence: ${line.evidence_satisfying_requirement}`, `Exhibit/Page: ${line.exhibit} / ${line.page_location}`]) },
    { title: "Payer-Specific Policy Crosswalk", lines: review.line_items.flatMap((line) => [`${line.hcpcs}: ${line.policy_crosswalk.applicable_policy}`, `Version: ${line.policy_crosswalk.policy_version_or_effective_date}`, `Requirement: ${line.policy_crosswalk.documentation_requirement}`, `Conclusion: ${line.policy_crosswalk.reviewer_conclusion}`]) },
    { title: "Item-Specific Medical Necessity Narratives", lines: review.line_items.map((line) => line.medical_necessity_narrative) },
    { title: "Page-by-Page Evidence Index", lines: ["Page 1: Submission cover sheet", "Page 2: TRIDENT submission cover", "Page 3: Administrative routing", "Page 4: Case summary", "Page 5: Eligibility and benefits", "Page 6: Coverage criteria matrix", "Page 7: Policy crosswalk", "Page 8: Medical necessity narratives", "Page 9: Evidence index", "Page 10+: Exhibits / certification as applicable"] },
    { title: "Exhibit A - Signed Standard Written Order or Physician Order", lines: [caseRecord.signed_swo_document_id ? `Signed SWO document: ${caseRecord.signed_swo_document_id}` : "Missing signed SWO at authorization packet stage. Required before downstream billing."] },
    { title: "Exhibit B - Clinical Note or Intake Evidence", lines: [`Source document: ${caseRecord.source_document_id || "Not captured"}`, `Evidence status: ${review.deficiencies.length ? "Deficiencies present" : "Mapped"}`] },
    { title: "Exhibit C - Diagnostics / Labs / Functional Assessment", lines: [`Diagnostics: ${caseRecord.diagnostics_summary || "Not captured in source packet"}`] },
    { title: "Exhibit D - Demographics, Insurance, Eligibility, Benefits", lines: [`Patient: ${caseRecord.patient_name}`, `Payer: ${caseRecord.payer}`, `Member ID: ${caseRecord.member_id}`, `Eligibility source: ${caseRecord.eligibility_source || "Not captured"}`] },
    { title: "Exhibit E - Proof of Delivery", lines: [caseRecord.signed_pod_document_id ? `Signed POD document: ${caseRecord.signed_pod_document_id}` : "Not applicable until delivery/POD phase unless retrospective/claims route requires it."] },
    { title: "TRIDENT Reviewer Certification", lines: [`Certification status: ${caseRecord.trident_reviewer_certified_at ? "Certified" : "Pending reviewer certification"}`, `Reviewer: ${caseRecord.trident_reviewer_identity || "Pending"}`, `Certification timestamp: ${caseRecord.trident_reviewer_certified_at || "Pending"}`] },
  ];

  for (const section of pages) {
    const page = pdf.addPage([612, 792]);
    let y = 744;
    page.drawText(section.title, { x: 42, y, size: 16, font: bold, color: rgb(0.06, 0.09, 0.16) });
    y -= 28;
    for (const raw of section.lines) {
      for (const line of wrap(raw)) {
        if (y < 54) {
          y = 744;
          const next = pdf.addPage([612, 792]);
          next.drawText(`${section.title} (continued)`, { x: 42, y, size: 13, font: bold, color: rgb(0.06, 0.09, 0.16) });
          y -= 24;
        }
        pdf.getPages()[pdf.getPageCount() - 1].drawText(line, { x: 54, y, size: 10, font, color: rgb(0.15, 0.23, 0.35) });
        y -= 15;
      }
      y -= 4;
    }
  }

  const bytes = Buffer.from(await pdf.save());
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    page_count: pdf.getPageCount(),
    version: `trident-v2.1-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`,
  };
}

export function latestHardPacket(artifacts: StoredArtifact[]) {
  return artifacts
    .filter((artifact) => artifact.kind === "trident_hard_packet")
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null;
}

export function hasPayerSubmissionGate(caseRecord: SpearCase) {
  return ["DELIVERY_CONFIRMED"].includes(text(caseRecord.payer_submission_status))
    || ["PAYER_NO_AUTH_REQUIRED_VERIFIED", "AUTHORIZED", "PARTIALLY_AUTHORIZED", "PAYER_DISPOSITION_PENDING"].includes(text(caseRecord.payer_disposition_status));
}
