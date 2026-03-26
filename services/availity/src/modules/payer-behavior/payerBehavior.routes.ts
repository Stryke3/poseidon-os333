import { Router } from "express";
import {
  scorePayerCase,
  ingestPayerOutcome,
  createPayerRule,
  getPayerRules,
} from "./payerBehavior.controller.js";

const router = Router();

router.post("/score", scorePayerCase);
router.post("/outcome", ingestPayerOutcome);
router.get("/rules/:payerId", getPayerRules);
router.post("/rules", createPayerRule);

export default router;
