import { Router } from "express";
import {
  getPlaybookMatch,
  getPlaybooksByPayer,
  postPlaybook,
  postPlaybookExecute,
} from "./playbook.controller.js";

const router = Router();

router.get("/match", getPlaybookMatch);
router.post("/execute", postPlaybookExecute);
router.post("/", postPlaybook);
router.get("/:payerId", getPlaybooksByPayer);

export default router;
