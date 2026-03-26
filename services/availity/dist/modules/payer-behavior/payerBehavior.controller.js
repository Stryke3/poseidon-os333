"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scorePayerCase = scorePayerCase;
exports.ingestPayerOutcome = ingestPayerOutcome;
exports.createPayerRule = createPayerRule;
exports.getPayerRules = getPayerRules;
const payerBehavior_schemas_js_1 = require("./payerBehavior.schemas.js");
const payerBehavior_service_js_1 = require("./payerBehavior.service.js");
function actorFromReq(req) {
    return req.userId ?? "user";
}
/**
 * POST /score — accepts {@link scorePriorAuthBodySchema}: strict case fields plus optional
 * `packetId` / `diagnosisCodes` / legacy `hcpcs`; merges packet doc types when `packetId` is set.
 */
async function scorePayerCase(req, res, next) {
    try {
        const body = payerBehavior_schemas_js_1.scorePriorAuthBodySchema.parse(req.body);
        const { snapshot, score } = await payerBehavior_service_js_1.payerBehaviorService.scorePriorAuth(body, actorFromReq(req));
        res.json({ success: true, snapshotId: snapshot.id, ...score });
    }
    catch (err) {
        if (err instanceof Error && err.message === "CASE_NOT_FOUND") {
            res.status(404).json({ error: "Case not found" });
            return;
        }
        next(err);
    }
}
async function ingestPayerOutcome(req, res, next) {
    try {
        const input = payerBehavior_schemas_js_1.ingestOutcomeSchema.parse(req.body);
        const result = await payerBehavior_service_js_1.payerBehaviorService.ingestOutcome(input, actorFromReq(req));
        res.status(201).json({ success: true, result, outcome: result });
    }
    catch (error) {
        next(error);
    }
}
async function createPayerRule(req, res, next) {
    try {
        const input = payerBehavior_schemas_js_1.createPayerRuleSchema.parse(req.body);
        const rule = await payerBehavior_service_js_1.payerBehaviorService.createRule(input, actorFromReq(req));
        res.status(201).json({ success: true, rule });
    }
    catch (error) {
        next(error);
    }
}
async function getPayerRules(req, res, next) {
    try {
        const payerId = req.params.payerId;
        if (!payerId) {
            res.status(400).json({ error: "payerId required" });
            return;
        }
        const rules = await payerBehavior_service_js_1.payerBehaviorService.listRules(payerId);
        res.json({ success: true, rules });
    }
    catch (error) {
        next(error);
    }
}
//# sourceMappingURL=payerBehavior.controller.js.map