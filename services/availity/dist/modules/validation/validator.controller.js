"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createValidatorController = createValidatorController;
const validator_schemas_js_1 = require("./validator.schemas.js");
const validator_service_js_1 = require("./validator.service.js");
function actorFromReq(req) {
    return req.userId ?? "system";
}
function createValidatorController(prisma) {
    async function validatePreSubmit(req, res, next) {
        try {
            const body = validator_schemas_js_1.preSubmitValidationBodySchema.parse(req.body ?? {});
            const actor = (typeof body.actor === "string" ? body.actor : undefined) ?? actorFromReq(req);
            // Backwards-compatible: accept either { packetId } (load from DB) or a full ValidationInput.
            if (typeof body.packetId === "string" && body.packetId.trim()) {
                const result = await (0, validator_service_js_1.validatePacketPreSubmit)(prisma, {
                    packetId: body.packetId.trim(),
                    actor,
                });
                res.json(result);
                return;
            }
            const input = body;
            if (!input?.payerId || typeof input.payerId !== "string" || !input.payerId.trim()) {
                res.status(400).json({ error: "payerId is required (or provide packetId)" });
                return;
            }
            // Validate directly from supplied payload; persist to ValidationResult for audit.
            const manualRequirements = await prisma.manualRequirement.findMany({
                where: { payerId: input.payerId.trim(), active: true },
            });
            const payerRules = await prisma.payerRule.findMany({
                where: { payerId: input.payerId.trim(), active: true },
            });
            const { validateRequirements } = await import("./validator.rules.js");
            const result = validateRequirements(input, manualRequirements, payerRules, null);
            const record = await prisma.validationResult.create({
                data: {
                    caseId: input.caseId ?? null,
                    payerId: input.payerId.trim(),
                    status: result.status,
                    missingRequirements: JSON.parse(JSON.stringify(result.missingRequirements)),
                    violations: JSON.parse(JSON.stringify(result.violations)),
                    warnings: JSON.parse(JSON.stringify(result.warnings)),
                    recommendedActions: JSON.parse(JSON.stringify(result.recommendedActions)),
                    explanation: JSON.parse(JSON.stringify(result.explanation)),
                },
            });
            res.json({ id: record.id, ...result });
        }
        catch (err) {
            if (err instanceof Error) {
                if (err.message === "PACKET_NOT_FOUND") {
                    res.status(404).json({ error: "Packet not found" });
                    return;
                }
                if (err.message === "CASE_NOT_FOUND") {
                    res.status(404).json({ error: "Case not found" });
                    return;
                }
                if (err.message === "NO_PLAYBOOK_MATCH") {
                    res.status(400).json({ error: "No matching playbook found" });
                    return;
                }
            }
            next(err);
        }
    }
    // Backwards-compatible alias (older code referenced `preSubmitValidation`).
    const preSubmitValidation = validatePreSubmit;
    return { validatePreSubmit, preSubmitValidation };
}
//# sourceMappingURL=validator.controller.js.map