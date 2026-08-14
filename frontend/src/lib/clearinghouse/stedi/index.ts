import { randomUUID, createHash } from "node:crypto";
import type { ClearinghouseAdapter, ClearinghouseTransaction } from "@/lib/clearinghouse/types";
import { assertFeatureEnabled, getStediConfig } from "./config";
import { stediEndpoints, stediRequest } from "./client";
import { mapCaseToClaim, normalizeEligibility, normalizeEra } from "./mappers";

function transaction(input: Partial<ClearinghouseTransaction>): ClearinghouseTransaction {
  const now = new Date().toISOString();
  return {
    id: `txn_${randomUUID()}`,
    caseId: String(input.caseId || ""),
    orderId: input.orderId,
    claimId: input.claimId,
    transactionType: input.transactionType!,
    sourceSystem: "STEDI",
    status: input.status || "PENDING",
    mode: getStediConfig().mode,
    payerId: input.payerId,
    correlationId: input.correlationId || randomUUID(),
    idempotencyKey: input.idempotencyKey,
    stediTransactionId: input.stediTransactionId,
    retryCount: input.retryCount || 0,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    rawRequest: input.rawRequest,
    rawResponse: input.rawResponse,
    createdAt: now,
    updatedAt: now,
  };
}

function idempotency(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export const stediAdapter: ClearinghouseAdapter = {
  async checkEligibility(input) {
    assertFeatureEnabled("eligibilityEnabled");
    const caseRecord = input.caseRecord as Parameters<typeof normalizeEligibility>[0];
    const request = input.request as Record<string, unknown>;
    const { data, correlationId } = await stediRequest<Record<string, unknown>>(stediEndpoints.eligibility, { method: "POST", body: request });
    const stediTransactionId = String(data.transactionId || data.id || correlationId);
    const txn = transaction({ caseId: caseRecord.id, orderId: caseRecord.order_id, transactionType: "ELIGIBILITY_270", status: "RECEIVED", payerId: String(caseRecord.payer || ""), correlationId, stediTransactionId, rawRequest: request, rawResponse: data });
    return { transaction: txn, eligibility: normalizeEligibility(caseRecord, data, stediTransactionId) };
  },
  async submitProfessionalClaim(input) {
    assertFeatureEnabled("claimsEnabled");
    const caseRecord = input.caseRecord as Parameters<typeof mapCaseToClaim>[0];
    const version = Number(input.version || 1);
    const mapped = mapCaseToClaim(caseRecord, version);
    const key = idempotency(["837P", caseRecord.id, caseRecord.order_id, mapped.patientControlNumber, version]);
    const { data, correlationId } = await stediRequest<Record<string, unknown>>(stediEndpoints.professionalClaim, { method: "POST", body: mapped.stediPayload, idempotencyKey: key });
    const stediTransactionId = String(data.transactionId || data.id || correlationId);
    const txn = transaction({ caseId: caseRecord.id, orderId: caseRecord.order_id, transactionType: "PROFESSIONAL_CLAIM_837P", status: "SENT", payerId: String(caseRecord.payer || ""), correlationId, idempotencyKey: key, stediTransactionId, rawRequest: mapped.stediPayload, rawResponse: data });
    return { transaction: txn, claim: { ...mapped, idempotencyKey: key, stediTransactionId }, rawResponse: data };
  },
  async createClaimAttachment(input) {
    assertFeatureEnabled("attachmentsEnabled");
    const request = { contentType: input.contentType };
    const { data, correlationId } = await stediRequest<Record<string, unknown>>(stediEndpoints.attachmentFile, { method: "POST", base: "claims", body: request });
    const uploadUrl = String(data.uploadUrl || "");
    if (uploadUrl && input.content) {
      await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": input.contentType }, body: new Uint8Array(input.content) });
    }
    const txn = transaction({ caseId: String(input.metadata?.caseId || ""), transactionType: "CLAIM_ATTACHMENT_275", status: "RECEIVED", correlationId, stediTransactionId: String(data.attachmentId || data.id || correlationId), rawRequest: request, rawResponse: data });
    return { transaction: txn, attachmentId: String(data.attachmentId || data.id || ""), rawResponse: data };
  },
  async get277CA(transactionId) {
    assertFeatureEnabled("claimsEnabled");
    const { data, correlationId } = await stediRequest<Record<string, unknown>>(stediEndpoints.report277(transactionId));
    return { transaction: transaction({ transactionType: "CLAIM_ACK_277CA", status: "RECEIVED", correlationId, stediTransactionId: transactionId, rawResponse: data }), rawResponse: data };
  },
  async checkClaimStatus(input) {
    assertFeatureEnabled("statusEnabled");
    const { data, correlationId } = await stediRequest<Record<string, unknown>>(stediEndpoints.claimStatus, { method: "POST", body: input });
    const normalizedStatus = String(data.status || data.claimStatus || "UNKNOWN").toUpperCase();
    return { transaction: transaction({ caseId: String(input.caseId || ""), claimId: String(input.claimId || ""), transactionType: "CLAIM_STATUS_276", status: "RECEIVED", correlationId, rawRequest: input, rawResponse: data }), normalizedStatus, rawResponse: data };
  },
  async get835ERA(transactionId) {
    assertFeatureEnabled("eraEnabled");
    const { data, correlationId } = await stediRequest<Record<string, unknown>>(stediEndpoints.report835(transactionId));
    return { transaction: transaction({ transactionType: "ERA_835", status: "RECEIVED", correlationId, stediTransactionId: transactionId, rawResponse: data }), remittance: normalizeEra(data, transactionId), rawResponse: data };
  },
};
