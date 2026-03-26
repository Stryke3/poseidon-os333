"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = require("../../lib/prisma.js");
const packet_controller_js_1 = require("./packet.controller.js");
const { createPacket, listPacketsForCase, getPacket, generatePacket, postPacketPayerScore, generateAndSubmitPriorAuth, submitPacketPriorAuth, } = (0, packet_controller_js_1.createPacketController)(prisma_js_1.prisma);
const router = (0, express_1.Router)();
router.post("/", createPacket);
router.get("/case/:caseId", listPacketsForCase);
router.post("/generate-and-submit", generateAndSubmitPriorAuth);
router.get("/:packetId", getPacket);
router.post("/:packetId/generate", generatePacket);
router.post("/:packetId/payer-score", postPacketPayerScore);
router.post("/:packetId/submit-prior-auth", submitPacketPriorAuth);
exports.default = router;
//# sourceMappingURL=packet.routes.js.map