"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.integrationRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
/** 30 requests per minute per IP on integration endpoints */
exports.integrationRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests — try again later" },
});
//# sourceMappingURL=rate-limit.js.map