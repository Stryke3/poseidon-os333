export declare class AvailityError extends Error {
    readonly statusCode: number;
    readonly details?: unknown;
    constructor(message: string, statusCode?: number, details?: unknown);
}
export declare class AvailityAuthError extends AvailityError {
    constructor(message?: string, details?: unknown);
}
export declare class AvailityApiError extends AvailityError {
    constructor(message?: string, statusCode?: number, details?: unknown);
}
export declare class AvailityTimeoutError extends AvailityError {
    constructor(endpoint: string);
}
export declare class AvailityValidationError extends Error {
    readonly details: unknown;
    constructor(message: string, details: unknown);
}
//# sourceMappingURL=errors.d.ts.map