import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { createValidatorController } from "./validator.controller.js";

const { validatePreSubmit } = createValidatorController(prisma);

const router = Router();

router.post("/pre-submit", validatePreSubmit);

export default router;

