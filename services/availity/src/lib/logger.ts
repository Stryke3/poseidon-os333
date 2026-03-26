import pino from "pino";
import { config } from "../config.js";
import { REDACTED_HEADERS } from "../constants.js";

export const logger = pino({
  level: config.nodeEnv === "test" ? "silent" : "info",
  transport:
    config.nodeEnv === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers['x-api-key']",
      "client_secret",
      "access_token",
      "*.client_secret",
      "*.access_token",
    ],
    censor: "[REDACTED]",
  },
});

/** Strip sensitive headers from an object before logging / persisting */
export function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = REDACTED_HEADERS.includes(k.toLowerCase() as any)
      ? "[REDACTED]"
      : v;
  }
  return out;
}

/** Redact known secret fields from arbitrary payload objects */
export function redactPayload(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactPayload);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    if (
      lower.includes("secret") ||
      lower.includes("password") ||
      lower.includes("token") ||
      lower === "authorization"
    ) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redactPayload(v);
    }
  }
  return out;
}
