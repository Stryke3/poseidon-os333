"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.availityClient = exports.AvailityClient = void 0;
exports.checkEligibility = checkEligibility;
exports.submitPriorAuth = submitPriorAuth;
exports.getPriorAuthStatus = getPriorAuthStatus;
const config_js_1 = require("../config.js");
const token_cache_js_1 = require("../lib/token-cache.js");
const errors_js_1 = require("../lib/errors.js");
const eligibility_js_1 = require("../normalizers/eligibility.js");
const audit_js_1 = require("../lib/audit.js");
class AvailityClient {
    async request(options, retry = true) {
        const token = await token_cache_js_1.availityAuthService.getAccessToken();
        const url = `${config_js_1.availityConfig.baseUrl}${options.path}`;
        const headers = {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
        };
        if (options.method !== "GET") {
            headers["Content-Type"] = "application/json";
        }
        let response;
        try {
            response = await fetch(url, {
                method: options.method,
                headers,
                body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
                signal: AbortSignal.timeout(config_js_1.availityConfig.timeoutMs),
            });
        }
        catch (err) {
            const e = err;
            if (e?.name === "TimeoutError" || e?.name === "AbortError") {
                throw new errors_js_1.AvailityTimeoutError(url);
            }
            throw err;
        }
        const rawText = await response.text();
        let parsed;
        try {
            parsed = rawText ? JSON.parse(rawText) : {};
        }
        catch {
            parsed = { rawText };
        }
        await (0, audit_js_1.writeAvailityAuditLog)({
            caseId: options.caseId ?? null,
            action: options.action,
            endpoint: url,
            requestPayload: options.body,
            responsePayload: parsed,
            httpStatus: response.status,
            actor: options.actor ?? "system",
        });
        if (response.status === 401 && retry) {
            await token_cache_js_1.availityAuthService.getAccessToken(true);
            return this.request(options, false);
        }
        if (!response.ok) {
            throw new errors_js_1.AvailityApiError("Availity API request failed", response.status, {
                path: options.path,
                body: parsed,
            });
        }
        return { raw: parsed, status: response.status };
    }
    /** Raw POST (legacy / tests) — returns unnormalized Availity JSON. */
    async executeRaw(options) {
        const method = options.method ?? "POST";
        const { raw } = await this.request({
            method,
            path: options.path,
            body: options.body,
            caseId: options.caseId,
            actor: options.actor,
            action: options.action,
        });
        return raw;
    }
    buildEligibilityWireBody(input) {
        // TODO: Align submitterTransactionId / payer / subscriber / serviceType with Availity product API
        // docs (sandbox vs prod) — field names and required segments may differ by payer channel.
        const { firstName, lastName, dob } = input.patient;
        const body = {
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
    async getEligibility(input, actor = "system") {
        const wireBody = this.buildEligibilityWireBody(input);
        const { raw } = await this.request({
            method: "POST",
            path: config_js_1.availityConfig.eligibilityPath,
            body: wireBody,
            caseId: input.caseId,
            actor,
            action: "eligibility_check",
        });
        return (0, eligibility_js_1.normalizeEligibility)(raw);
    }
    async submitPriorAuth(payload, caseId, actor = "system") {
        // TODO: Map prior-auth JSON to the exact schema Availity returns/accepts per integration guide
        // (diagnosis/procedure/serviceType shapes vary by line of business).
        const { raw } = await this.request({
            method: "POST",
            path: config_js_1.availityConfig.priorAuthPath,
            body: payload,
            caseId,
            actor,
            action: "prior_auth_submit",
        });
        return raw;
    }
    async getPriorAuthStatus(authId, caseId, actor = "system") {
        const { raw } = await this.request({
            method: "GET",
            path: `${config_js_1.availityConfig.priorAuthPath}/${encodeURIComponent(authId)}`,
            caseId,
            actor,
            action: "prior_auth_status",
        });
        return raw;
    }
}
exports.AvailityClient = AvailityClient;
exports.availityClient = new AvailityClient();
/** @deprecated Prefer availityClient.getEligibility for domain-shaped requests. */
async function checkEligibility(payload, opts = {}) {
    return exports.availityClient.executeRaw({
        path: config_js_1.availityConfig.eligibilityPath,
        body: payload,
        caseId: opts.caseId,
        actor: opts.actor,
        action: "eligibility_check",
        method: "POST",
    });
}
async function submitPriorAuth(payload, opts = {}) {
    return exports.availityClient.submitPriorAuth(payload, opts.caseId, opts.actor ?? "system");
}
async function getPriorAuthStatus(authId, opts = {}) {
    return exports.availityClient.getPriorAuthStatus(authId, opts.caseId, opts.actor ?? "system");
}
//# sourceMappingURL=availity-client.js.map