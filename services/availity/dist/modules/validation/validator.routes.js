"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = require("../../lib/prisma.js");
const validator_controller_js_1 = require("./validator.controller.js");
const { validatePreSubmit } = (0, validator_controller_js_1.createValidatorController)(prisma_js_1.prisma);
const router = (0, express_1.Router)();
router.post("/pre-submit", validatePreSubmit);
exports.default = router;
//# sourceMappingURL=validator.routes.js.map