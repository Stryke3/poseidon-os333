import { randomUUID } from "node:crypto";
import { appendWorkflowEvent, getCase, listCases, updateCaseAndAppendEvent, type SpearCase } from "@/lib/poseidon-store";
import type { AuthorizationDecision, Claim, ClaimValidationResult, ClearinghouseTransaction, EligibilityCheck, Remittance, RevenueException } from "@/lib/clearinghouse/types";
import { validateClaimCase } from "@/lib/clearinghouse/stedi/mappers";

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function prepend<T>(value: unknown, item: T) {
  return [item, ...arr<T>(value)];
}

export async function appendTransaction(caseRecord: SpearCase, transaction: ClearinghouseTransaction) {
  await updateCaseAndAppendEvent(caseRecord.id, {
    clearinghouse_transactions: prepend(caseRecord.clearinghouse_transactions, transaction),
  }, `STEDI_${transaction.transactionType}_${transaction.status}`, {
    transaction_id: transaction.id,
    transaction_type: transaction.transactionType,
    status: transaction.status,
    correlation_id: transaction.correlationId,
  });
}

export async function appendEligibility(caseRecord: SpearCase, eligibility: EligibilityCheck, transaction: ClearinghouseTransaction) {
  await updateCaseAndAppendEvent(caseRecord.id, {
    eligibility_checks: prepend(caseRecord.eligibility_checks, eligibility),
    eligibility_status: eligibility.status,
    eligibility_checked_at: eligibility.checkedAt,
    clearinghouse_transactions: prepend(caseRecord.clearinghouse_transactions, transaction),
    status: eligibility.status === "ACTIVE" ? "trident_review" : caseRecord.status,
  }, "STEDI_ELIGIBILITY_RECEIVED", {
    transaction_id: transaction.id,
    eligibility_status: eligibility.status,
    correlation_id: transaction.correlationId,
  });
}

export async function appendAuthorization(caseRecord: SpearCase, decision: AuthorizationDecision) {
  await updateCaseAndAppendEvent(caseRecord.id, {
    authorization_decisions: prepend(caseRecord.authorization_decisions, decision),
    authorization_status: decision.status,
    authorization_route: decision.route,
    status: decision.status === "NOT_REQUIRED" || decision.status === "APPROVED" ? "ready_to_fulfill" : caseRecord.status,
  }, "TRIDENT_AUTH_DECISION", {
    authorization_id: decision.id,
    status: decision.status,
    route: decision.route,
  });
}

export function validateCaseForClaim(caseRecord: SpearCase): ClaimValidationResult {
  return validateClaimCase(caseRecord);
}

export async function appendClaim(caseRecord: SpearCase, claim: Claim, transaction?: ClearinghouseTransaction) {
  await updateCaseAndAppendEvent(caseRecord.id, {
    claims: prepend(caseRecord.claims, claim),
    claim_status: claim.status,
    status: claim.status === "CLAIM_SUBMITTED" ? "staged_for_upload" : caseRecord.status,
    clearinghouse_transactions: transaction ? prepend(caseRecord.clearinghouse_transactions, transaction) : caseRecord.clearinghouse_transactions,
  }, "STEDI_CLAIM_SUBMITTED", {
    claim_id: claim.id,
    transaction_id: transaction?.id,
    patient_control_number: claim.patientControlNumber,
    status: claim.status,
  });
}

export async function appendRevenueException(exception: RevenueException) {
  const caseRecord = exception.caseId ? await getCase(exception.caseId) : null;
  if (caseRecord) {
    await updateCaseAndAppendEvent(caseRecord.id, {
      revenue_exceptions: prepend(caseRecord.revenue_exceptions, exception),
    }, "POSEIDON_REVENUE_EXCEPTION", {
      exception_id: exception.id,
      category: exception.category,
      status: exception.status,
    });
  }
  return exception;
}

export function buildException(input: Omit<RevenueException, "id" | "status" | "createdAt" | "updatedAt">): RevenueException {
  const now = new Date().toISOString();
  return { id: `rex_${randomUUID()}`, status: "OPEN", createdAt: now, updatedAt: now, ...input };
}

export async function listClaims() {
  const cases = await listCases();
  return cases.flatMap((caseRecord) => arr<Claim>(caseRecord.claims).map((claim) => ({ ...claim, case: caseRecord })));
}

export async function getClaim(claimId: string) {
  return (await listClaims()).find((claim) => claim.id === claimId || claim.patientControlNumber === claimId) || null;
}

export async function appendRemittance(remittance: Remittance, transaction?: ClearinghouseTransaction) {
  const caseRecord = remittance.caseId ? await getCase(remittance.caseId) : null;
  if (!caseRecord) {
    return appendRevenueException(buildException({
      category: "UNMATCHED_ERA",
      title: "ERA could not be matched to a SPEAR claim.",
      detail: "The remittance was preserved but no unambiguous claim match was found.",
      nextAction: "Review unmatched ERA and link manually.",
    }));
  }
  await updateCaseAndAppendEvent(caseRecord.id, {
    remittances: prepend(caseRecord.remittances, remittance),
    clearinghouse_transactions: transaction ? prepend(caseRecord.clearinghouse_transactions, transaction) : caseRecord.clearinghouse_transactions,
    eraReceived: true,
    payerPaidAmount: remittance.paidAmount,
    paymentReference: remittance.paymentReference,
    paymentDate: remittance.paymentDate,
    bankReconciled: false,
    status: remittance.status === "PAID" ? "closed" : caseRecord.status,
  }, "STEDI_ERA_RECEIVED", {
    remittance_id: remittance.id,
    status: remittance.status,
    transaction_id: transaction?.id,
  });
  return remittance;
}

export async function resolveRevenueException(caseId: string, exceptionId: string) {
  const caseRecord = await getCase(caseId);
  if (!caseRecord) return null;
  const exceptions = arr<RevenueException>(caseRecord.revenue_exceptions).map((exception) => exception.id === exceptionId
    ? { ...exception, status: "RESOLVED" as const, resolvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    : exception);
  await updateCaseAndAppendEvent(caseRecord.id, { revenue_exceptions: exceptions }, "POSEIDON_REVENUE_EXCEPTION_RESOLVED", { exception_id: exceptionId });
  return exceptions.find((exception) => exception.id === exceptionId) || null;
}

export async function revenueCycle(caseRecord: SpearCase) {
  return {
    eligibility: arr<EligibilityCheck>(caseRecord.eligibility_checks)[0] || null,
    authorization: arr<AuthorizationDecision>(caseRecord.authorization_decisions)[0] || null,
    claims: arr<Claim>(caseRecord.claims),
    remittances: arr<Remittance>(caseRecord.remittances),
    exceptions: arr<RevenueException>(caseRecord.revenue_exceptions),
    transactions: arr<ClearinghouseTransaction>(caseRecord.clearinghouse_transactions),
  };
}

export async function audit(caseId: string, eventType: string, payload: unknown) {
  return appendWorkflowEvent(caseId, eventType, payload);
}
