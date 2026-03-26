"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.redactHeaders = redactHeaders;
exports.redactPayload = redactPayload;
const pino_1 = __importDefault(require("pino"));
const config_js_1 = require("../config.js");
const constants_js_1 = require("../constants.js");
exports.logger = (0, pino_1.default)({
    level: config_js_1.config.nodeEnv === "test" ? "silent" : "info",
    transport: config_js_1.config.nodeEnv === "development"
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
function redactHeaders(headers) {
    const out = {};
    for (const [k, v] of Object.entries(headers)) {
        out[k] = constants_js_1.REDACTED_HEADERS.includes(k.toLowerCase())
            ? "[REDACTED]"
            : v;
    }
    return out;
}
/** Redact known secret fields from arbitrary payload objects */
function redactPayload(obj) {
    if (obj === null || obj === undefined)
        return obj;
    if (typeof obj !== "object")
        return obj;
    if (Array.isArray(obj))
        return obj.map(redactPayload);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        const lower = k.toLowerCase();
        if (lower.includes("secret") ||
            lower.includes("password") ||
            lower.includes("token") ||
            lower === "authorization") {
            out[k] = "[REDACTED]";
        }
        else {
            out[k] = redactPayload(v);
        }
    }
    return out;
}
//# sourceMappingURL=logger.js.map