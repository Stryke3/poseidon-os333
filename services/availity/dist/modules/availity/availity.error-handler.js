"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const availity_errors_js_1 = require("./availity.errors.js");
const logger_js_1 = require("../../lib/logger.js");
function errorHandler(err, _req, res, _next) {
    if (err instanceof zod_1.ZodError) {
        res.status(400).json({
            error: "ZodError",
            message: "Validation failed",
            details: err.issues.map((e) => ({
                field: e.path.join("."),
                message: e.message,
            })),
        });
        return;
    }
    if (err instanceof availity_errors_js_1.AvailityValidationError) {
        res.status(400).json({
            error: err.name,
            message: err.message,
            details: err.details ?? null,
        });
        return;
    }
    if (err instanceof availity_errors_js_1.AvailityError) {
        res.status(err.statusCode).json({
            error: err.name,
            message: err.message,
            details: err.details ?? null,
        });
        return;
    }
    if (err && typeof err === "object" && "message" in err) {
        logger_js_1.logger.error({ err }, "Unhandled error");
        res.status(500).json({
            error: "InternalServerError",
            message: String(err.message),
        });
        return;
    }
    logger_js_1.logger.error({ err }, "Unhandled error");
    res.status(500).json({
        error: "InternalServerError",
        message: "An unexpected error occurred",
    });
}
//# sourceMappingURL=availity.error-handler.js.map