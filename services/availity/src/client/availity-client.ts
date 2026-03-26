import { availityConfig } from "../config.js";
import { availityAuthService } from "../lib/token-cache.js";
import { httpRequest } from "../lib/http.js";
import type { NormalizedEligibilityResponse } from "../types/availity.js";
import { AvailityApiError, AvailityTimeoutError } from "../lib/errors.js";
import { normalizeEligibility } from "../normalizers/eligibility.js";
import { writeAvailityAuditLog } from "../lib/audit.js";

export type EligibilityClientInput = {
  caseId: string;
  payerId: string;
  memberId: string;
  patient: { firstName: string; lastName: string; dob: string };
  provider?: { npi?: string };
};

type RequestOptions = {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  caseId?: string;
  actor?: string;
  action: string;
};

export class AvailityClient {
  private async request<T>(
    options: RequestOptions,
    retry = true,
  ): Promise<{ raw: T; status: number }> {
    const token = await availityAuthService.getAccessToken();

    const url = `${availityConfig.baseUrl}${options.path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    };

    if (options.method !== "GET") {
      headers["Content-Type"] = "application/json";
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(availityConfig.timeoutMs),
      });
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e?.name === "TimeoutError" || e?.name === "AbortError") {
        throw new AvailityTimeoutError(url);
      }
      throw err;
    }

    const rawText = await response.text();

    let parsed: unknown;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsed = { rawText };
    }

    await writeAvailityAuditLog({
      caseId: options.caseId ?? null,
      action: options.action,
      endpoint: url,
      requestPayload: options.body,
      responsePayload: parsed,
      httpStatus: response.status,
      actor: options.actor ?? "system",
    });

    if (response.status === 401 && retry) {
      await availityAuthService.getAccessToken(true);
      return this.request<T>(options, false);
    }

    if (!response.ok) {
      throw new AvailityApiError("Availity API request failed", response.status, {
        path: options.path,
        body: parsed,
      });
    }

    return { raw: parsed as T, status: response.status };
  }

  /** Raw POST (legacy / tests) — returns unnormalized Availity JSON. */
  async executeRaw(
    options: Omit<RequestOptions, "method"> & { method?: "GET" | "POST" },
  ): Promise<unknown> {
    const method: "GET" | "POST" = options.method ?? "POST";
    const { raw } = await this.request<unknown>({
      method,
      path: options.path,
      body: options.body,
      caseId: options.caseId,
      actor: options.actor,
      action: options.action,
    });
    return raw;
  }

  private buildEligibilityWireBody(input: EligibilityClientInput): Record<string, unknown> {
    // TODO: Align submitterTransactionId / payer / subscriber / serviceType with Availity product API
    // docs (sandbox vs prod) — field names and required segments may differ by payer channel.
    const { firstName, lastName, dob } = input.patient;
    const body: Record<string, unknown> = {
      submitterTransactionId: input.caseId,
      payer: { id: input.payerId },
      subscriber: {
        firstName,
        lastName,
        birthDate: dob,
        memberId: input.memberId,
      },
      serviceType: "30",
    };
    if (input.provider?.npi) {
      body.renderingProvider = { npi: input.provider.npi };
    }
    return body;
  }

  async getEligibility(
    input: EligibilityClientInput,
    actor = "system",
  ): Promise<NormalizedEligibilityResponse> {
    const wireBody = this.buildEligibilityWireBody(input);
    const { raw } = await this.request<unknown>({
      method: "POST",
      path: availityConfig.eligibilityPath,
      body: wireBody,
      caseId: input.caseId,
      actor,
      action: "eligibility_check",
    });
    return normalizeEligibility(raw);
  }

  async submitPriorAuth(
    payload: Record<string, unknown>,
    caseId?: string,
    actor = "system",
  ): Promise<unknown> {
    // TODO: Map prior-auth JSON to the exact schema Availity returns/accepts per integration guide
    // (diagnosis/procedure/serviceType shapes vary by line of business).
    const { raw } = await this.request<unknown>({
      method: "POST",
      path: availityConfig.priorAuthPath,
      body: payload,
      caseId,
      actor,
      action: "prior_auth_submit",
    });
    return raw;
  }

  async getPriorAuthStatus(
    authId: string,
    caseId?: string,
    actor = "system",
  ): Promise<unknown> {
    const { raw } = await this.request<unknown>({
      method: "GET",
      path: `${availityConfig.priorAuthPath}/${encodeURIComponent(authId)}`,
      caseId,
      actor,
      action: "prior_auth_status",
    });
    return raw;
  }
}

export const availityClient = new AvailityClient();

export interface LegacyClientOpts {
  actor?: string;
  caseId?: string;
}

/** @deprecated Prefer availityClient.getEligibility for domain-shaped requests. */
export async function checkEligibility(
  payload: unknown,
  opts: LegacyClientOpts = {},
) {
  return availityClient.executeRaw({
    path: availityConfig.eligibilityPath,
    body: payload,
    caseId: opts.caseId,
    actor: opts.actor,
    action: "eligibility_check",
    method: "POST",
  });
}

export async function submitPriorAuth(
  payload: unknown,
  opts: LegacyClientOpts = {},
) {
  return availityClient.submitPriorAuth(
    payload as Record<string, unknown>,
    opts.caseId,
    opts.actor ?? "system",
  );
}

export async function getPriorAuthStatus(
  authId: string,
  opts: LegacyClientOpts = {},
) {
  return availityClient.getPriorAuthStatus(
    authId,
    opts.caseId,
    opts.actor ?? "system",
  );
}
