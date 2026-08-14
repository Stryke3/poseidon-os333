import { listCases } from "@/lib/poseidon-store";

function daysSince(value: unknown) {
  const time = new Date(String(value || "")).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

function bucket(days: number) {
  if (days <= 30) return "0-30";
  if (days <= 45) return "31-45";
  if (days <= 60) return "46-60";
  if (days <= 90) return "61-90";
  if (days <= 120) return "91-120";
  return "120+";
}

export async function revenueSupportMetrics() {
  const cases = await listCases();
  const claims = cases.flatMap((caseRecord) => Array.isArray(caseRecord.claims) ? caseRecord.claims as Array<Record<string, unknown>> : []);
  const remittances = cases.flatMap((caseRecord) => Array.isArray(caseRecord.remittances) ? caseRecord.remittances as Array<Record<string, unknown>> : []);
  const exceptions = cases.flatMap((caseRecord) => Array.isArray(caseRecord.revenue_exceptions) ? caseRecord.revenue_exceptions as Array<Record<string, unknown>> : []);
  const totalBilled = claims.reduce((sum, claim) => sum + Number(claim.submittedAmount || 0), 0);
  const totalAllowed = remittances.reduce((sum, era) => sum + Number(era.allowedAmount || 0), 0);
  const payerPayments = remittances.reduce((sum, era) => sum + Number(era.paidAmount || 0), 0);
  const patientResponsibility = remittances.reduce((sum, era) => sum + Number(era.patientResponsibility || 0), 0);
  const contractualAdjustments = remittances.reduce((sum, era) => sum + Number(era.contractualAdjustment || 0), 0);
  const accepted = claims.filter((claim) => ["CLAIM_ACCEPTED", "PAYER_PROCESSING", "ADJUDICATED", "PAID", "PARTIAL"].includes(String(claim.status))).length;
  const denied = claims.filter((claim) => String(claim.status) === "DENIED").length;
  return {
    readyToBill: cases.filter((row) => row.status === "ready_to_bill").length,
    submitted: claims.filter((claim) => String(claim.status) === "CLAIM_SUBMITTED").length,
    rejected: claims.filter((claim) => String(claim.status) === "CLAIM_REJECTED").length,
    payerProcessing: claims.filter((claim) => String(claim.status) === "PAYER_PROCESSING").length,
    denied,
    partial: claims.filter((claim) => String(claim.status) === "PARTIAL").length,
    paid: claims.filter((claim) => String(claim.status) === "PAID").length,
    postingExceptions: exceptions.filter((exception) => String(exception.category) === "POSTING" && String(exception.status) !== "RESOLVED").length,
    unmatchedEra: exceptions.filter((exception) => String(exception.category) === "UNMATCHED_ERA" && String(exception.status) !== "RESOLVED").length,
    totalBilled,
    totalAllowed,
    payerPayments,
    patientResponsibility,
    contractualAdjustments,
    insuranceAr: Math.max(0, totalAllowed - payerPayments - patientResponsibility),
    claimsRequiringAction: exceptions.filter((exception) => String(exception.status) !== "RESOLVED").length,
    cleanClaimAcceptanceRate: claims.length ? accepted / claims.length : 0,
    denialRate: claims.length ? denied / claims.length : 0,
    agingBuckets: claims.reduce<Record<string, number>>((acc, claim) => {
      const key = bucket(daysSince(claim.submittedAt || claim.createdAt));
      acc[key] = (acc[key] || 0) + Number(claim.submittedAmount || 0);
      return acc;
    }, {}),
  };
}
