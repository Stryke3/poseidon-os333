"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = require("../../lib/prisma.js");
const availity_controller_js_1 = require("./availity.controller.js");
const packet_routes_js_1 = __importDefault(require("../packet/packet.routes.js"));
const { checkEligibility, getPriorAuthStatus, healthCheckAvaility, submitPriorAuth, } = (0, availity_controller_js_1.createAvailityController)(prisma_js_1.prisma);
const router = (0, express_1.Router)();
router.get("/health", healthCheckAvaility);
router.post("/eligibility", checkEligibility);
router.post("/prior-auth", submitPriorAuth);
router.get("/prior-auth/:authId", getPriorAuthStatus);
router.use("/packets", packet_routes_js_1.default);
exports.default = router;
//# sourceMappingURL=availity.routes.js.map