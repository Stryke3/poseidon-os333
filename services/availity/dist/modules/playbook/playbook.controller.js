"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postPlaybook = postPlaybook;
exports.getPlaybooksByPayer = getPlaybooksByPayer;
exports.getPlaybookMatch = getPlaybookMatch;
exports.postPlaybookExecute = postPlaybookExecute;
const playbook_schemas_js_1 = require("./playbook.schemas.js");
const playbook_service_js_1 = require("./playbook.service.js");
function actorFromReq(req) {
    return req.userId ?? "user";
}
async function postPlaybook(req, res, next) {
    try {
        const body = playbook_schemas_js_1.createPlaybookBodySchema.parse(req.body);
        const row = await playbook_service_js_1.playbookService.createPlaybook(body, actorFromReq(req));
        res.status(201).json({ success: true, playbook: row });
    }
    catch (err) {
        if (err instanceof Error && err.message.startsWith("PLAYBOOK_VERSION_CONFLICT")) {
            res.status(409).json({ error: err.message, code: "PLAYBOOK_VERSION_CONFLICT" });
            return;
        }
        next(err);
    }
}
async function getPlaybooksByPayer(req, res, next) {
    try {
        const payerId = req.params.payerId;
        if (!payerId) {
            res.status(400).json({ error: "payerId required" });
            return;
        }
        const includeInactive = req.query.includeInactive === "1" || req.query.includeInactive === "true";
        const playbooks = await playbook_service_js_1.playbookService.listByPayerId(payerId, { includeInactive });
        res.json({ success: true, playbooks });
    }
    catch (err) {
        next(err);
    }
}
async function getPlaybookMatch(req, res, next) {
    try {
        const q = playbook_schemas_js_1.matchPlaybooksQuerySchema.parse({
            payerId: req.query.payerId,
            planName: req.query.planName,
            deviceCategory: req.query.deviceCategory,
            hcpcsCode: req.query.hcpcsCode,
            diagnosisCodes: req.query.diagnosisCodes,
        });
        const dx = q.diagnosisCodes
            ? q.diagnosisCodes
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        const ctx = {
            payerId: q.payerId,
            planName: q.planName,
            deviceCategory: q.deviceCategory,
            hcpcsCode: q.hcpcsCode,
            diagnosisCodes: dx,
        };
        const result = await playbook_service_js_1.playbookService.matchPlaybooks(ctx);
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function postPlaybookExecute(req, res, next) {
    try {
        const body = playbook_schemas_js_1.executePlaybookBodySchema.parse(req.body);
        const result = await playbook_service_js_1.playbookService.executeOnPacket({
            packetId: body.packetId,
            playbookId: body.playbookId,
            actor: actorFromReq(req),
            runPayerScore: body.runPayerScore,
        });
        res.json(result);
    }
    catch (err) {
        if (err instanceof Error && err.message === "PACKET_NOT_FOUND") {
            res.status(404).json({ error: "Packet not found" });
            return;
        }
        if (err instanceof Error && err.message === "CASE_NOT_FOUND") {
            res.status(404).json({ error: "Case not found" });
            return;
        }
        if (err instanceof Error && err.message === "PLAYBOOK_NOT_FOUND") {
            res.status(404).json({ error: "Playbook not found for payer" });
            return;
        }
        if (err instanceof Error && err.message === "NO_PLAYBOOK_MATCH") {
            res.status(422).json({
                error: "No active playbook matches this packet context.",
                code: "NO_PLAYBOOK_MATCH",
            });
            return;
        }
        next(err);
    }
}
//# sourceMappingURL=playbook.controller.js.map