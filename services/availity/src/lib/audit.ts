import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";
import type { AvailityAuditPayload } from "../types/availity.js";

let prisma: PrismaClient | null = null;

export function setAuditPrisma(client: PrismaClient): void {
  prisma = client;
}

/** @deprecated Use AvailityAuditPayload */
export type AuditEntry = AvailityAuditPayload;

/** Strip secret-like keys before audit DB rows or error logs (never persist bearer tokens). */
export function redactSensitiveFields(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveFields);
  }

  const cloned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lower = key.toLowerCase();

    if (
      lower.includes("authorization") ||
      lower.includes("token") ||
      lower === "access_token" ||
      lower === "id_token" ||
      lower === "refresh_token" ||
      lower.includes("client_secret") ||
      lower.includes("secret") ||
      lower === "password"
    ) {
      cloned[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      cloned[key] = redactSensitiveFields(value);
    } else {
      cloned[key] = value;
    }
  }

  return cloned;
}

export async function writeAvailityAuditLog(
  payload: AvailityAuditPayload,
): Promise<void> {
  if (!prisma) {
    logger.warn("Prisma not initialised — skipping DB audit write");
    return;
  }

  await prisma.availityAuditLog.create({
    data: {
      caseId: payload.caseId ?? null,
      action: payload.action,
      endpoint: payload.endpoint,
      requestPayload: redactSensitiveFields(payload.requestPayload) as any,
      responsePayload: redactSensitiveFields(payload.responsePayload) as any,
      httpStatus: payload.httpStatus ?? null,
      actor: payload.actor ?? null,
    },
  });
}

/**
 * Persist an audit row and emit a structured log line.
 * Payloads are redacted before storage to avoid persisting secrets.
 */
export async function audit(entry: AvailityAuditPayload): Promise<void> {
  const httpStatus = entry.httpStatus ?? null;
  const actor = entry.actor ?? "system";

  logger.info(
    {
      audit: true,
      action: entry.action,
      caseId: entry.caseId,
      endpoint: entry.endpoint,
      httpStatus,
      actor,
    },
    "audit_log",
  );

  try {
    await writeAvailityAuditLog(entry);
  } catch (err) {
    logger.error({ err }, "Failed to persist audit log");
  }
}
