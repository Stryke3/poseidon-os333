import pino from "pino";
export declare const logger: pino.Logger<never, boolean>;
/** Strip sensitive headers from an object before logging / persisting */
export declare function redactHeaders(headers: Record<string, string>): Record<string, string>;
/** Redact known secret fields from arbitrary payload objects */
export declare function redactPayload(obj: unknown): unknown;
//# sourceMappingURL=logger.d.ts.map