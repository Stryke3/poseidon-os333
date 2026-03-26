export type AvailityTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

export type AvailityEligibilityRequest = {
  payerId: string;
  memberId: string;
  patient: {
    firstName: string;
    lastName: string;
    dob: string; // YYYY-MM-DD
  };
  provider?: {
    npi?: string;
  };
  caseId?: string;
};

export type NormalizedEligibilityResponse = {
  success: boolean;
  coverageActive: boolean | null;
  payerName: string | null;
  memberId: string | null;
  planName: string | null;
  deductible: number | null;
  deductibleRemaining: number | null;
  authRequired: boolean | null;
  rawResponse: unknown;
};

export type AvailityAuditPayload = {
  caseId?: string | null;
  action: string;
  endpoint: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
  httpStatus?: number | null;
  actor?: string | null;
};

export type CachedToken = {
  accessToken: string;
  expiresAtEpochMs: number;
};
