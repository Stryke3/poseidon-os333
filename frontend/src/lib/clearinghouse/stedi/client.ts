import { randomUUID } from "node:crypto";
import { getStediConfig } from "./config";
import { normalizeStediError, StediIntegrationError } from "./errors";

const HEALTHCARE_BASE = "https://healthcare.us.stedi.com/2024-04-01";
const CLAIMS_BASE = "https://claims.us.stedi.com/2025-03-07";

export type StediRequestOptions = {
  method?: "GET" | "POST" | "PUT";
  base?: "healthcare" | "claims" | "absolute";
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
  contentType?: string;
};

function baseUrl(base: StediRequestOptions["base"]) {
  if (base === "claims") return CLAIMS_BASE;
  if (base === "absolute") return "";
  return HEALTHCARE_BASE;
}

export async function stediRequest<T>(path: string, options: StediRequestOptions = {}): Promise<{ data: T; correlationId: string }> {
  const config = getStediConfig();
  if (!config.apiKey) throw new StediIntegrationError("STEDI_NOT_CONFIGURED", "Stedi not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15_000);
  const correlationId = randomUUID();
  const headers: Record<string, string> = {
    Authorization: config.apiKey,
    "Content-Type": options.contentType || "application/json",
    "X-SPEAR-Correlation-ID": correlationId,
  };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  try {
    const response = await fetch(`${baseUrl(options.base)}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : options.contentType && options.contentType !== "application/json" ? options.body as BodyInit : JSON.stringify(options.body),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? "STEDI_AUTH_ERROR" : response.status >= 500 ? "STEDI_UPSTREAM_ERROR" : "STEDI_VALIDATION_ERROR";
      throw new StediIntegrationError(code, typeof data?.message === "string" ? data.message : `Stedi returned HTTP ${response.status}`, { status: response.status, retriable: response.status >= 500 });
    }
    return { data: data as T, correlationId };
  } catch (error) {
    throw normalizeStediError(error);
  } finally {
    clearTimeout(timeout);
  }
}

export const stediEndpoints = {
  eligibility: "/change/medicalnetwork/eligibility/v3",
  professionalClaim: "/change/medicalnetwork/professionalclaims/v3/submission",
  claimStatus: "/change/medicalnetwork/claimstatus/v2",
  report277: (transactionId: string) => `/change/medicalnetwork/reports/v2/${encodeURIComponent(transactionId)}/277`,
  report835: (transactionId: string) => `/change/medicalnetwork/reports/v2/${encodeURIComponent(transactionId)}/835`,
  attachmentFile: "/claim-attachments/file",
};
