import { Router } from "express";
import {
  denialDetails,
  denialQueue,
  classifyDenialEvent,
  generateAppealPacket,
  intakeDenial,
  recordDenialOutcome,
  submitRecoveryPacket,
} from "./denial.controller.js";

const router = Router();

router.post("/intake", intakeDenial);
router.post("/classify", classifyDenialEvent);
router.post("/generate-appeal", generateAppealPacket);
router.post("/submit-recovery", submitRecoveryPacket);
router.post("/outcome", recordDenialOutcome);

// Admin support endpoints (queue + details)
router.get("/queue", denialQueue);
router.get("/:denialEventId", denialDetails);

export default router;

