"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAuditPrisma = setAuditPrisma;
exports.redactSensitiveFields = redactSensitiveFields;
exports.writeAvailityAuditLog = writeAvailityAuditLog;
exports.audit = audit;
const logger_js_1 = require("./logger.js");
let prisma = null;
function setAuditPrisma(client) {
    prisma = client;
}
/** Strip secret-like keys before audit DB rows or error logs (never persist bearer tokens). */
function redactSensitiveFields(obj) {
    if (!obj || typeof obj !== "object")
        return obj;
    if (Array.isArray(obj)) {
        return obj.map(redactSensitiveFields);
    }
    const cloned = {};
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        if (lower.includes("authorization") ||
            lower.includes("token") ||
            lower === "access_token" ||
            lower === "id_token" ||
            lower === "refresh_token" ||
            lower.includes("client_secret") ||
            lower.includes("secret") ||
            lower === "password") {
            cloned[key] = "[REDACTED]";
        }
        else if (typeof value === "object" && value !== null) {
            cloned[key] = redactSensitiveFields(value);
        }
        else {
            cloned[key] = value;
        }
    }
    return cloned;
}
async function writeAvailityAuditLog(payload) {
    if (!prisma) {
        logger_js_1.logger.warn("Prisma not initialised — skipping DB audit write");
        return;
    }
    await prisma.availityAuditLog.create({
        data: {
            caseId: payload.caseId ?? null,
            action: payload.action,
            endpoint: payload.endpoint,
            requestPayload: redactSensitiveFields(payload.requestPayload),
            responsePayload: redactSensitiveFields(payload.responsePayload),
            httpStatus: payload.httpStatus ?? null,
            actor: payload.actor ?? null,
        },
    });
}
/**
 * Persist an audit row and emit a structured log line.
 * Payloads are redacted before storage to avoid persisting secrets.
 */
async function audit(entry) {
    const httpStatus = entry.httpStatus ?? null;
    const actor = entry.actor ?? "system";
    logger_js_1.logger.info({
        audit: true,
        action: entry.action,
        caseId: entry.caseId,
        endpoint: entry.endpoint,
        httpStatus,
        actor,
    }, "audit_log");
    try {
        await writeAvailityAuditLog(entry);
    }
    catch (err) {
        logger_js_1.logger.error({ err }, "Failed to persist audit log");
    }
}
//# sourceMappingURL=audit.js.map