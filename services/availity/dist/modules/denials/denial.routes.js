"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const denial_controller_js_1 = require("./denial.controller.js");
const router = (0, express_1.Router)();
router.post("/intake", denial_controller_js_1.intakeDenial);
router.post("/classify", denial_controller_js_1.classifyDenialEvent);
router.post("/generate-appeal", denial_controller_js_1.generateAppealPacket);
router.post("/submit-recovery", denial_controller_js_1.submitRecoveryPacket);
router.post("/outcome", denial_controller_js_1.recordDenialOutcome);
// Admin support endpoints (queue + details)
router.get("/queue", denial_controller_js_1.denialQueue);
router.get("/:denialEventId", denial_controller_js_1.denialDetails);
exports.default = router;
//# sourceMappingURL=denial.routes.js.map