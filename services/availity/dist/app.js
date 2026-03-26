"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const availity_routes_js_1 = __importDefault(require("./modules/availity/availity.routes.js"));
const payerBehavior_routes_js_1 = __importDefault(require("./modules/payer-behavior/payerBehavior.routes.js"));
const playbook_routes_js_1 = __importDefault(require("./modules/playbook/playbook.routes.js"));
const governance_routes_js_1 = __importDefault(require("./modules/governance/governance.routes.js"));
const learning_routes_js_1 = __importDefault(require("./modules/learning/learning.routes.js"));
const validator_routes_js_1 = __importDefault(require("./modules/validation/validator.routes.js"));
const denial_routes_js_1 = __importDefault(require("./modules/denials/denial.routes.js"));
const availity_error_handler_js_1 = require("./modules/availity/availity.error-handler.js");
const rate_limit_js_1 = require("./lib/rate-limit.js");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.get("/live", (_req, res) => {
    res.status(200).type("text/plain").send("ok");
});
app.use("/api/integrations/availity", rate_limit_js_1.integrationRateLimiter, availity_routes_js_1.default);
app.use("/api/intelligence/payer", rate_limit_js_1.integrationRateLimiter, payerBehavior_routes_js_1.default);
app.use("/api/playbooks", rate_limit_js_1.integrationRateLimiter, playbook_routes_js_1.default);
app.use("/api/intelligence/governance", rate_limit_js_1.integrationRateLimiter, governance_routes_js_1.default);
// Learning UI (admin pages use `/api/learning/*`).
app.use("/api/learning", rate_limit_js_1.integrationRateLimiter, learning_routes_js_1.default);
// Pre-submit packet validation before Availity submission.
app.use("/api/validation", validator_routes_js_1.default);
// Denial-to-appeal automation engine.
app.use("/api/denials", rate_limit_js_1.integrationRateLimiter, denial_routes_js_1.default);
app.use(availity_error_handler_js_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map