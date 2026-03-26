"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AvailityValidationError = exports.AvailityTimeoutError = exports.AvailityApiError = exports.AvailityAuthError = exports.AvailityError = void 0;
class AvailityError extends Error {
    statusCode;
    details;
    constructor(message, statusCode = 500, details) {
        super(message);
        this.name = "AvailityError";
        this.statusCode = statusCode;
        this.details = details;
    }
}
exports.AvailityError = AvailityError;
class AvailityAuthError extends AvailityError {
    constructor(message = "Failed to authenticate with Availity", details) {
        super(message, 401, details);
        this.name = "AvailityAuthError";
    }
}
exports.AvailityAuthError = AvailityAuthError;
class AvailityApiError extends AvailityError {
    constructor(message = "Availity API request failed", statusCode = 502, details) {
        super(message, statusCode, details);
        this.name = "AvailityApiError";
    }
}
exports.AvailityApiError = AvailityApiError;
class AvailityTimeoutError extends AvailityError {
    constructor(endpoint) {
        super(`Availity request timed out: ${endpoint}`, 504);
        this.name = "AvailityTimeoutError";
    }
}
exports.AvailityTimeoutError = AvailityTimeoutError;
class AvailityValidationError extends Error {
    details;
    constructor(message, details) {
        super(message);
        this.details = details;
        this.name = "AvailityValidationError";
    }
}
exports.AvailityValidationError = AvailityValidationError;
//# sourceMappingURL=errors.js.map