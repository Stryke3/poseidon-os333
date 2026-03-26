export class AvailityError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = "AvailityError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class AvailityAuthError extends AvailityError {
  constructor(
    message = "Failed to authenticate with Availity",
    details?: unknown,
  ) {
    super(message, 401, details);
    this.name = "AvailityAuthError";
  }
}

export class AvailityApiError extends AvailityError {
  constructor(
    message = "Availity API request failed",
    statusCode = 502,
    details?: unknown,
  ) {
    super(message, statusCode, details);
    this.name = "AvailityApiError";
  }
}

export class AvailityTimeoutError extends AvailityError {
  constructor(endpoint: string) {
    super(`Availity request timed out: ${endpoint}`, 504);
    this.name = "AvailityTimeoutError";
  }
}

export class AvailityValidationError extends Error {
  constructor(
    message: string,
    public readonly details: unknown,
  ) {
    super(message);
    this.name = "AvailityValidationError";
  }
}
