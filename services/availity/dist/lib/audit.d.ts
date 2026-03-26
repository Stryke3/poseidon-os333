import { PrismaClient } from "@prisma/client";
import type { AvailityAuditPayload } from "../types/availity.js";
export declare function setAuditPrisma(client: PrismaClient): void;
/** @deprecated Use AvailityAuditPayload */
export type AuditEntry = AvailityAuditPayload;
/** Strip secret-like keys before audit DB rows or error logs (never persist bearer tokens). */
export declare function redactSensitiveFields(obj: unknown): unknown;
export declare function writeAvailityAuditLog(payload: AvailityAuditPayload): Promise<void>;
/**
 * Persist an audit row and emit a structured log line.
 * Payloads are redacted before storage to avoid persisting secrets.
 */
export declare function audit(entry: AvailityAuditPayload): Promise<void>;
//# sourceMappingURL=audit.d.ts.map