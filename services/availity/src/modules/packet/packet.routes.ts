import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { createPacketController } from "./packet.controller.js";

const {
  createPacket,
  listPacketsForCase,
  getPacket,
  generatePacket,
  postPacketPayerScore,
  generateAndSubmitPriorAuth,
  submitPacketPriorAuth,
} = createPacketController(prisma);

const router = Router();

router.post("/", createPacket);
router.get("/case/:caseId", listPacketsForCase);
router.post("/generate-and-submit", generateAndSubmitPriorAuth);
router.get("/:packetId", getPacket);
router.post("/:packetId/generate", generatePacket);
router.post("/:packetId/payer-score", postPacketPayerScore);
router.post("/:packetId/submit-prior-auth", submitPacketPriorAuth);

export default router;
