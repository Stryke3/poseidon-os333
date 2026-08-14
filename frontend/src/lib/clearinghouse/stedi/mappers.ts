import type { SpearCase } from "@/lib/poseidon-store";
import type { Claim, ClaimServiceLine, ClaimValidationResult, EligibilityCheck, Remittance } from "@/lib/clearinghouse/types";
import { applyUniversalE0676 } from "@/lib/spear-e0676";

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function text(value: unknown) {
  return String(value || "").trim();
}

export function patientControlNumber(caseRecord: SpearCase, version = 1) {
  const core = String(caseRecord.order_id || caseRecord.id).replace(/[^A-Za-z0-9]+/g, "").slice(-18);
  return `SFM-${core}-${version}`;
}

export function validateClaimCase(caseRecord: SpearCase): ClaimValidationResult {
  const blockers: ClaimValidationResult["blockers"] = [];
  const required: Array<[string, unknown, string]> = [
    ["PATIENT_IDENTITY", caseRecord.patient_name && caseRecord.dob, "Patient name and DOB are required."],
    ["MEMBER_ID", caseRecord.member_id, "Subscriber/member ID is required."],
    ["PAYER", caseRecord.payer, "Payer is required."],
    ["PROVIDER_NPI", caseRecord.npi, "Billing/order provider NPI is required."],
    ["SERVICE_DATE", caseRecord.order_date, "Service/order date is required."],
    ["LATERALITY", caseRecord.laterality, "Laterality is required for orthopedic DME."],
  ];
  for (const [code, value, message] of required) if (!text(value)) blockers.push({ code, message });
  if (!list(caseRecord.final_icd || caseRecord.operator_approved_icd || caseRecord.source_icd || caseRecord.icd).length) blockers.push({ code: "DIAGNOSIS", message: "At least one ICD-10 diagnosis pointer is required." });
  if (!list(caseRecord.final_hcpcs || caseRecord.operator_approved_hcpcs || caseRecord.trident_recommended_hcpcs || caseRecord.source_hcpcs || caseRecord.hcpcs).length) blockers.push({ code: "PROCEDURE", message: "At least one HCPCS line is required." });
  const auth = latestAuthorization(caseRecord);
  if (auth?.required === true && auth.status !== "APPROVED") blockers.push({ code: "AUTHORIZATION", message: "Required authorization is not approved/documented." });
  if (auth?.required === true && !auth.authorizationNumber) blockers.push({ code: "AUTHORIZATION_NUMBER", message: "Authorization number is required for this payer/order." });
  if (!String(caseRecord.signed_swo_document_id || "").trim()) blockers.push({ code: "SIGNED_SWO", message: "Signed SWO/order must be uploaded before claim submission." });
  if (!String(caseRecord.signed_pod_document_id || "").trim()) blockers.push({ code: "POD", message: "Signed proof of delivery must be uploaded before claim submission." });
  return { ok: blockers.length === 0, blockers };
}

export function serviceLines(caseRecord: SpearCase): ClaimServiceLine[] {
  const codes = list(caseRecord.final_hcpcs || caseRecord.operator_approved_hcpcs || caseRecord.trident_recommended_hcpcs || caseRecord.source_hcpcs || caseRecord.hcpcs);
  const lines = applyUniversalE0676(codes.map((code) => ({ code, hcpcs: code, quantity: 1 })), caseRecord.payer);
  const diagnoses = list(caseRecord.final_icd || caseRecord.operator_approved_icd || caseRecord.source_icd || caseRecord.icd);
  return lines.map((line, index) => {
    const row = line as Record<string, unknown>;
    return {
      lineNumber: index + 1,
      hcpcs: String(row.hcpcs || row.code || ""),
      modifiers: [String(row.modifier || "")].filter(Boolean),
      units: Number(row.units || row.quantity || 1),
      chargeAmount: Number(row.chargeAmount || row.charge_amount || 0),
      diagnosisPointers: diagnoses.map((_, dxIndex) => String(dxIndex + 1)),
    };
  }).filter((line) => line.hcpcs);
}

export function mapCaseToEligibilityRequest(caseRecord: SpearCase) {
  return {
    controlNumber: patientControlNumber(caseRecord),
    tradingPartnerServiceId: text(caseRecord.canonical_payer_id || caseRecord.payer_id || caseRecord.payer),
    provider: { npi: text(caseRecord.npi), organizationName: text(caseRecord.facility || "StrykeFox Medical") },
    subscriber: {
      memberId: text(caseRecord.member_id),
      firstName: text(caseRecord.first_name || caseRecord.patient_name).split(/\s+/)[0],
      lastName: text(caseRecord.last_name || caseRecord.patient_name).split(/\s+/).slice(1).join(" "),
      dateOfBirth: text(caseRecord.dob),
    },
    encounter: {
      dateOfService: text(caseRecord.order_date),
      serviceTypeCodes: ["12"],
    },
  };
}

export function normalizeEligibility(caseRecord: SpearCase, raw: Record<string, unknown>, transactionId: string): EligibilityCheck {
  const plan = raw.planInformation as Record<string, unknown> | undefined;
  const active = String(raw.status || raw.eligibilityStatus || "").toLowerCase();
  const status = active.includes("active") ? "ACTIVE" : active.includes("inactive") ? "INACTIVE" : "UNKNOWN";
  return {
    id: `elig_${crypto.randomUUID()}`,
    caseId: caseRecord.id,
    status,
    checkedAt: new Date().toISOString(),
    payerId: text(caseRecord.canonical_payer_id || caseRecord.payer),
    payerName: text(caseRecord.payer),
    memberId: text(caseRecord.member_id),
    planName: text(plan?.planName || raw.planName),
    groupNumber: text(caseRecord.group_number || raw.groupNumber),
    effectiveDate: text(raw.effectiveDate),
    terminationDate: text(raw.terminationDate),
    authorizationIndicator: "UNKNOWN",
    authorizationNotes: "Eligibility received; authorization decision remains with Trident/Poseidon routing.",
    rawTransactionId: transactionId,
  };
}

export function mapCaseToClaim(caseRecord: SpearCase, version = 1): Partial<Claim> & { stediPayload: Record<string, unknown> } {
  const lines = serviceLines(caseRecord);
  const control = patientControlNumber(caseRecord, version);
  const amount = lines.reduce((sum, line) => sum + line.chargeAmount, 0);
  const diagnoses = list(caseRecord.final_icd || caseRecord.operator_approved_icd || caseRecord.source_icd || caseRecord.icd);
  return {
    version,
    patientControlNumber: control,
    submittedAmount: amount,
    serviceLines: lines,
    attachmentIds: [],
    stediPayload: {
      controlNumber: control,
      tradingPartnerServiceId: text(caseRecord.canonical_payer_id || caseRecord.payer_id || caseRecord.payer),
      submitter: { organizationName: "StrykeFox Medical" },
      receiver: { organizationName: text(caseRecord.payer) },
      subscriber: { memberId: text(caseRecord.member_id), dateOfBirth: text(caseRecord.dob) },
      claimInformation: {
        patientControlNumber: control,
        placeOfServiceCode: "12",
        claimFrequencyCode: "1",
        signatureIndicator: "Y",
        planParticipationCode: "A",
        benefitsAssignmentCertificationIndicator: "Y",
        releaseInformationCode: "Y",
        claimChargeAmount: amount,
        diagnosisCodes: diagnoses,
        serviceLines: lines.map((line) => ({
          serviceLineNumber: line.lineNumber,
          professionalService: {
            procedureIdentifier: "HC",
            procedureCode: line.hcpcs,
            procedureModifiers: line.modifiers,
            lineItemChargeAmount: line.chargeAmount,
            measurementUnit: "UN",
            serviceUnitCount: line.units,
          },
          diagnosisCodePointers: line.diagnosisPointers,
        })),
      },
      renderingProvider: { name: text(caseRecord.provider), npi: text(caseRecord.npi) },
      referringProvider: { name: text(caseRecord.provider), npi: text(caseRecord.npi) },
    },
  };
}

export function latestAuthorization(caseRecord: SpearCase) {
  const decisions = Array.isArray(caseRecord.authorization_decisions) ? caseRecord.authorization_decisions : [];
  return decisions[0] as { required?: boolean | "UNKNOWN"; status?: string; authorizationNumber?: string } | undefined;
}

export function normalizeEra(raw: Record<string, unknown>, transactionId: string): Remittance {
  const paid = Number(raw.paidAmount || raw.totalPayment || 0);
  const billed = Number(raw.billedAmount || 0);
  const allowed = Number(raw.allowedAmount || 0);
  return {
    id: `era_${crypto.randomUUID()}`,
    status: paid > 0 && paid < billed ? "PARTIALLY_PAID" : paid > 0 ? "PAID" : "ADJUDICATED",
    payer: text(raw.payer || raw.payerName),
    paymentDate: text(raw.paymentDate),
    paymentReference: text(raw.paymentReference || raw.traceNumber),
    totalPayment: paid,
    billedAmount: billed,
    allowedAmount: allowed,
    paidAmount: paid,
    patientResponsibility: Number(raw.patientResponsibility || 0),
    contractualAdjustment: Number(raw.contractualAdjustment || 0),
    bankReconciled: false,
    rawTransactionId: transactionId,
    rawResponse: raw,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
