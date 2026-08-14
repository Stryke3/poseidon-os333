export type ClearinghouseTransactionType =
  | "ELIGIBILITY_270"
  | "CLAIM_ATTACHMENT_275"
  | "PROFESSIONAL_CLAIM_837P"
  | "CLAIM_ACK_277CA"
  | "CLAIM_STATUS_276"
  | "ERA_835";

export type ClearinghouseStatus = "DISABLED" | "PENDING" | "SENT" | "RECEIVED" | "ERROR";

export type ClearinghouseTransaction = {
  id: string;
  caseId: string;
  orderId?: string;
  claimId?: string;
  transactionType: ClearinghouseTransactionType;
  sourceSystem: "STEDI";
  status: ClearinghouseStatus;
  mode: "test" | "production";
  payerId?: string;
  correlationId: string;
  idempotencyKey?: string;
  stediTransactionId?: string;
  retryCount: number;
  errorCode?: string;
  errorMessage?: string;
  rawRequest?: unknown;
  rawResponse?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type EligibilityStatus = "ACTIVE" | "INACTIVE" | "UNKNOWN" | "ERROR";

export type EligibilityCheck = {
  id: string;
  caseId: string;
  status: EligibilityStatus;
  checkedAt: string;
  payerId?: string;
  payerName?: string;
  memberId?: string;
  planName?: string;
  groupNumber?: string;
  effectiveDate?: string;
  terminationDate?: string;
  deductibleIndividual?: number;
  deductibleRemaining?: number;
  coinsurance?: number;
  copay?: number;
  outOfPocket?: number;
  authorizationIndicator?: "REQUIRED" | "NOT_REQUIRED" | "UNKNOWN";
  authorizationNotes?: string;
  rawTransactionId?: string;
};

export type AuthorizationDecision = {
  id: string;
  caseId: string;
  required: boolean | "UNKNOWN";
  route: "NO_AUTH_REQUIRED" | "EXTERNAL_API" | "PAYER_PORTAL" | "FAX" | "MANUAL_REVIEW";
  status: "NOT_REQUIRED" | "REQUIRED" | "SUBMITTED" | "PENDING" | "APPROVED" | "DENIED" | "UNKNOWN";
  authorizationNumber?: string;
  effectiveDate?: string;
  expirationDate?: string;
  approvedUnits?: number;
  approvedCodes?: string[];
  evidence: Array<Record<string, unknown>>;
  humanReviewRequired: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClaimStatus =
  | "VALIDATION_FAILED"
  | "READY_TO_SUBMIT"
  | "CLAIM_SUBMITTED"
  | "CLAIM_ACCEPTED"
  | "CLAIM_REJECTED"
  | "PAYER_PROCESSING"
  | "ADJUDICATED"
  | "PAID"
  | "PARTIAL"
  | "DENIED"
  | "PAYMENT_POSTED"
  | "RESIDUAL_AR"
  | "CLOSED";

export type ClaimServiceLine = {
  lineNumber: number;
  hcpcs: string;
  modifiers: string[];
  units: number;
  chargeAmount: number;
  diagnosisPointers: string[];
  attachmentIds?: string[];
};

export type Claim = {
  id: string;
  caseId: string;
  orderId?: string;
  version: number;
  status: ClaimStatus;
  payer?: string;
  payerId?: string;
  patientControlNumber: string;
  idempotencyKey: string;
  submittedAmount: number;
  submittedAt?: string;
  stediTransactionId?: string;
  serviceLines: ClaimServiceLine[];
  attachmentIds: string[];
  statusHistory: Array<{ status: ClaimStatus | string; at: string; detail?: string }>;
  rawResponse?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type RevenueExceptionCategory =
  | "ELIGIBILITY"
  | "AUTHORIZATION"
  | "DOCUMENTATION"
  | "CLAIM_REJECTION"
  | "PAYER_PROCESSING"
  | "DENIAL"
  | "UNDERPAYMENT"
  | "POSTING"
  | "UNMATCHED_ERA"
  | "TIMELY_FILING"
  | "APPEAL_REQUIRED"
  | "MANUAL_REVIEW";

export type RevenueException = {
  id: string;
  caseId?: string;
  claimId?: string;
  category: RevenueExceptionCategory;
  status: "OPEN" | "RESOLVED";
  title: string;
  detail: string;
  nextAction: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
};

export type Remittance = {
  id: string;
  caseId?: string;
  claimId?: string;
  status: "ADJUDICATED" | "PAID" | "PARTIALLY_PAID" | "DENIED" | "UNMATCHED_ERA" | "POSTING_EXCEPTION" | "PAYMENT_POSTED";
  payer?: string;
  paymentDate?: string;
  paymentReference?: string;
  totalPayment: number;
  billedAmount: number;
  allowedAmount: number;
  paidAmount: number;
  patientResponsibility: number;
  contractualAdjustment: number;
  bankReconciled: boolean;
  bankReconciledAt?: string;
  bankReconciliationMethod?: string;
  rawTransactionId?: string;
  rawResponse?: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ClaimValidationResult = {
  ok: boolean;
  blockers: Array<{ code: string; message: string }>;
};

export interface ClearinghouseAdapter {
  checkEligibility(input: Record<string, unknown>): Promise<{ transaction: ClearinghouseTransaction; eligibility: EligibilityCheck }>;
  submitProfessionalClaim(input: Record<string, unknown>): Promise<{ transaction: ClearinghouseTransaction; claim: Partial<Claim>; rawResponse: unknown }>;
  createClaimAttachment(input: { filename: string; contentType: string; content?: Buffer; metadata?: Record<string, unknown> }): Promise<{ transaction: ClearinghouseTransaction; attachmentId?: string; rawResponse: unknown }>;
  get277CA(transactionId: string): Promise<{ transaction: ClearinghouseTransaction; rawResponse: unknown }>;
  checkClaimStatus(input: Record<string, unknown>): Promise<{ transaction: ClearinghouseTransaction; normalizedStatus: string; rawResponse: unknown }>;
  get835ERA(transactionId: string): Promise<{ transaction: ClearinghouseTransaction; remittance: Remittance; rawResponse: unknown }>;
}
