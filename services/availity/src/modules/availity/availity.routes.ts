import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { createAvailityController } from "./availity.controller.js";
import packetRoutes from "../packet/packet.routes.js";

const {
  checkEligibility,
  getPriorAuthStatus,
  healthCheckAvaility,
  submitPriorAuth,
} = createAvailityController(prisma);

const router = Router();

router.get("/health", healthCheckAvaility);
router.post("/eligibility", checkEligibility);
router.post("/prior-auth", submitPriorAuth);
router.get("/prior-auth/:authId", getPriorAuthStatus);
router.use("/packets", packetRoutes);

export default router;
