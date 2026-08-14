export class StediIntegrationError extends Error {
  code: string;
  status?: number;
  retriable: boolean;

  constructor(code: string, message: string, opts: { status?: number; retriable?: boolean } = {}) {
    super(message);
    this.name = "StediIntegrationError";
    this.code = code;
    this.status = opts.status;
    this.retriable = opts.retriable ?? false;
  }
}

export function normalizeStediError(error: unknown): StediIntegrationError {
  if (error instanceof StediIntegrationError) return error;
  if (error instanceof Error && error.name === "AbortError") return new StediIntegrationError("STEDI_TIMEOUT", "Stedi request timed out", { retriable: true });
  if (error instanceof Error) return new StediIntegrationError("STEDI_NETWORK_ERROR", error.message, { retriable: true });
  return new StediIntegrationError("STEDI_UNKNOWN_ERROR", "Unknown Stedi integration error");
}
