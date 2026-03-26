"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const playbook_controller_js_1 = require("./playbook.controller.js");
const router = (0, express_1.Router)();
router.get("/match", playbook_controller_js_1.getPlaybookMatch);
router.post("/execute", playbook_controller_js_1.postPlaybookExecute);
router.post("/", playbook_controller_js_1.postPlaybook);
router.get("/:payerId", playbook_controller_js_1.getPlaybooksByPayer);
exports.default = router;
//# sourceMappingURL=playbook.routes.js.map