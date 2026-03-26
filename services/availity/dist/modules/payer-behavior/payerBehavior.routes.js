"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payerBehavior_controller_js_1 = require("./payerBehavior.controller.js");
const router = (0, express_1.Router)();
router.post("/score", payerBehavior_controller_js_1.scorePayerCase);
router.post("/outcome", payerBehavior_controller_js_1.ingestPayerOutcome);
router.get("/rules/:payerId", payerBehavior_controller_js_1.getPayerRules);
router.post("/rules", payerBehavior_controller_js_1.createPayerRule);
exports.default = router;
//# sourceMappingURL=payerBehavior.routes.js.map