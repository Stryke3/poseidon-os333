"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listGovernanceRecommendations = exports.evaluateLearning = void 0;
exports.postGovernanceManualIngest = postGovernanceManualIngest;
exports.ingestManuals = ingestManuals;
exports.postGovernanceExtractPreview = postGovernanceExtractPreview;
exports.postTridentManualsScan = postTridentManualsScan;
exports.getGovernanceManuals = getGovernanceManuals;
exports.postManualExtractPersist = postManualExtractPersist;
exports.getManualRequirementReviewQueue = getManualRequirementReviewQueue;
exports.postManualRequirementApprove = postManualRequirementApprove;
exports.postManualRequirementReject = postManualRequirementReject;
exports.getGovernanceManualDetail = getGovernanceManualDetail;
exports.postGovernanceLearningEvaluate = postGovernanceLearningEvaluate;
exports.getGovernanceRecommendations = getGovernanceRecommendations;
exports.getPlaybookPerformanceDashboard = getPlaybookPerformanceDashboard;
exports.getLearnedRuleSuggestions = getLearnedRuleSuggestions;
exports.postGovernanceRecommendApprove = postGovernanceRecommendApprove;
exports.getGovernanceDrafts = getGovernanceDrafts;
exports.getGovernanceDraftDetail = getGovernanceDraftDetail;
exports.postGovernanceDraftFromRecommendation = postGovernanceDraftFromRecommendation;
exports.postGovernanceRecommendReject = postGovernanceRecommendReject;
exports.extractManualRequirements = extractManualRequirements;
exports.approveGovernanceRecommendation = approveGovernanceRecommendation;
exports.rejectGovernanceRecommendation = rejectGovernanceRecommendation;
const prisma_js_1 = require("../../lib/prisma.js");
const governance_service_js_1 = require("./governance.service.js");
const manualIngestion_service_js_1 = require("./manualIngestion.service.js");
const manualExtraction_service_js_1 = require("./manualExtraction.service.js");
const recommendationEngine_service_js_1 = require("./recommendationEngine.service.js");
const manualRequirementExtraction_service_js_1 = require("./manualRequirementExtraction.service.js");
const learning_schemas_js_1 = require("./learning.schemas.js");
const manualScanIngestion_service_js_1 = require("./manualScanIngestion.service.js");
const governance_constants_js_1 = require("../governance/governance.constants.js");
function actorFromReq(req) {
    return req.userId ?? "system";
}
async function postGovernanceManualIngest(req, res, next) {
    try {
        const body = learning_schemas_js_1.ingestManualBodySchema.parse(req.body);
        const result = await (0, manualIngestion_service_js_1.ingestPayerManual)(prisma_js_1.prisma, body, actorFromReq(req));
        res.status(201).json({ success: true, ...result });
    }
    catch (err) {
        if (err instanceof Error && err.message === "MANUAL_SOURCE_REQUIRED") {
            res.status(400).json({ error: "Provide relativePath or rawText" });
            return;
        }
        if (err instanceof Error && err.message === "MANUAL_PATH_ESCAPE") {
            res.status(400).json({ error: "Invalid manual path" });
            return;
        }
        next(err);
    }
}
/**
 * POST /api/learning/manuals/ingest
 * - If request includes `rawText` or `relativePath`, falls back to single-manual ingest.
 * - Otherwise performs local recursive scan ingestion from the configured Trident manuals root.
 */
async function ingestManuals(req, res, next) {
    try {
        const body = (req.body ?? {});
        const hasSinglePayload = typeof body.rawText === "string" ||
            typeof body.relativePath === "string";
        let result;
        let status = 201;
        if (hasSinglePayload) {
            const parsed = learning_schemas_js_1.ingestManualBodySchema.parse(body);
            result = await (0, manualIngestion_service_js_1.ingestPayerManual)(prisma_js_1.prisma, parsed, actorFromReq(req));
        }
        if (!hasSinglePayload) {
            status = 200;
            const rootOverride = typeof body.root === "string" ? body.root : undefined;
            result = await manualIngestion_service_js_1.manualIngestionService.ingestAll({
                root: rootOverride,
                actor: actorFromReq(req),
            });
        }
        const parse = await (0, manualIngestion_service_js_1.parsePendingPayerManuals)(prisma_js_1.prisma, {
            actor: actorFromReq(req),
            useLlm: false,
        });
        res.status(status).json({ success: true, result, parse });
        return;
    }
    catch (err) {
        next(err);
    }
}
async function postGovernanceExtractPreview(req, res, next) {
    try {
        const body = learning_schemas_js_1.extractPreviewBodySchema.parse(req.body);
        const requirements = await (0, manualExtraction_service_js_1.previewManualExtraction)(body.rawText, { useLlm: body.useLlm ?? false });
        res.json({
            success: true,
            requirements,
            explainability: body.useLlm
                ? "Deterministic regex extraction plus optional LLM candidates (LLM items are PENDING_REVIEW only)."
                : "Deterministic pattern matches on manual text; set useLlm=true and MANUAL_EXTRACTION_LLM for optional LLM candidates.",
        });
    }
    catch (err) {
        if (err instanceof Error && err.message.includes("OPENAI_API_KEY_REQUIRED")) {
            res.status(400).json({ error: err.message });
            return;
        }
        next(err);
    }
}
async function postTridentManualsScan(req, res, next) {
    try {
        const body = learning_schemas_js_1.manualScanBodySchema.parse(req.body ?? {});
        const result = await (0, manualScanIngestion_service_js_1.scanAndIngestTridentManuals)(prisma_js_1.prisma, {
            root: body.root,
            actor: actorFromReq(req),
        });
        res.status(200).json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function getGovernanceManuals(req, res, next) {
    try {
        const payerId = req.query.payerId;
        const rows = await prisma_js_1.prisma.payerManual.findMany({
            where: payerId ? { payerId } : undefined,
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                payerId: true,
                planName: true,
                title: true,
                sourcePath: true,
                sourceType: true,
                versionLabel: true,
                effectiveDate: true,
                parsedStatus: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { requirements: true } },
            },
        });
        res.json({ success: true, manuals: rows });
    }
    catch (err) {
        next(err);
    }
}
async function postManualExtractPersist(req, res, next) {
    try {
        const manualId = req.params.manualId;
        const body = learning_schemas_js_1.manualExtractPersistBodySchema.parse(req.body ?? {});
        const manual = await prisma_js_1.prisma.payerManual.findUnique({ where: { id: manualId } });
        if (!manual) {
            res.status(404).json({ error: "Manual not found" });
            return;
        }
        const { created, candidates } = await (0, manualRequirementExtraction_service_js_1.persistManualRequirementExtractions)(prisma_js_1.prisma, manual.id, manual.payerId, manual.planName, manual.rawText, { useLlm: body.useLlm ?? false });
        await prisma_js_1.prisma.payerManual.update({
            where: { id: manualId },
            data: { parsedStatus: governance_constants_js_1.MANUAL_PARSED_STATUS.PARSED },
        });
        res.json({ success: true, created, candidates, manualId });
    }
    catch (err) {
        if (err instanceof Error && err.message.includes("OPENAI_API_KEY_REQUIRED")) {
            res.status(400).json({ error: err.message });
            return;
        }
        next(err);
    }
}
async function getManualRequirementReviewQueue(req, res, next) {
    try {
        const payerId = req.query.payerId;
        const reviewState = req.query.reviewState ?? governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.PENDING_REVIEW;
        const rows = await prisma_js_1.prisma.manualRequirement.findMany({
            where: {
                reviewState,
                ...(payerId ? { payerId } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 200,
            include: {
                manual: { select: { id: true, title: true, payerId: true, sourcePath: true, planName: true } },
            },
        });
        res.json({ success: true, items: rows });
    }
    catch (err) {
        next(err);
    }
}
async function postManualRequirementApprove(req, res, next) {
    try {
        const id = req.params.manualRequirementId;
        const body = learning_schemas_js_1.manualRequirementDecisionBodySchema.parse(req.body ?? {});
        const decidedBy = body.decidedBy ?? body.actor ?? actorFromReq(req);
        await prisma_js_1.prisma.manualRequirement.update({
            where: { id },
            data: { reviewState: governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.APPROVED, active: true },
        });
        res.json({ success: true, manualRequirementId: id, decidedBy });
    }
    catch (err) {
        next(err);
    }
}
async function postManualRequirementReject(req, res, next) {
    try {
        const id = req.params.manualRequirementId;
        const body = learning_schemas_js_1.manualRequirementDecisionBodySchema.parse(req.body ?? {});
        const decidedBy = body.decidedBy ?? body.actor ?? actorFromReq(req);
        await prisma_js_1.prisma.manualRequirement.update({
            where: { id },
            data: { reviewState: governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.REJECTED, active: false },
        });
        res.json({ success: true, manualRequirementId: id, decidedBy });
    }
    catch (err) {
        next(err);
    }
}
async function getGovernanceManualDetail(req, res, next) {
    try {
        const id = req.params.manualId;
        const manual = await prisma_js_1.prisma.payerManual.findUnique({
            where: { id },
            include: {
                requirements: { orderBy: { createdAt: "asc" } },
            },
        });
        if (!manual) {
            res.status(404).json({ error: "Manual not found" });
            return;
        }
        res.json({ success: true, manual });
    }
    catch (err) {
        next(err);
    }
}
async function postGovernanceLearningEvaluate(req, res, next) {
    try {
        const body = learning_schemas_js_1.learningEvaluateBodySchema.parse(req.body);
        const result = await (0, recommendationEngine_service_js_1.runLearningEvaluation)(prisma_js_1.prisma, {
            periodDays: body.periodDays,
            payerId: body.payerId,
            actor: actorFromReq(req),
        });
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function getGovernanceRecommendations(req, res, next) {
    try {
        const status = req.query.status ?? "PENDING";
        const rows = await prisma_js_1.prisma.governanceRecommendation.findMany({
            where: { status },
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        res.json({ success: true, recommendations: rows });
    }
    catch (err) {
        next(err);
    }
}
async function getPlaybookPerformanceDashboard(req, res, next) {
    try {
        const payerId = req.query.payerId;
        const playbookId = req.query.playbookId;
        const rows = await prisma_js_1.prisma.playbookPerformance.findMany({
            where: {
                ...(payerId ? { payerId } : {}),
                ...(playbookId ? { playbookId } : {}),
            },
            orderBy: { calculatedAt: "desc" },
            take: 100,
        });
        res.json({ success: true, performances: rows });
    }
    catch (err) {
        next(err);
    }
}
async function getLearnedRuleSuggestions(req, res, next) {
    try {
        const status = req.query.status ?? "DRAFT";
        const payerId = req.query.payerId;
        const rows = await prisma_js_1.prisma.learnedRuleSuggestion.findMany({
            where: { status, ...(payerId ? { payerId } : {}) },
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        res.json({ success: true, suggestions: rows });
    }
    catch (err) {
        next(err);
    }
}
async function postGovernanceRecommendApprove(req, res, next) {
    try {
        const id = req.params.recommendationId;
        const body = learning_schemas_js_1.governanceDecisionBodySchema.parse(req.body ?? {});
        const decidedBy = body.decidedBy ?? body.actor ?? actorFromReq(req);
        const notes = body.notes ?? body.reason;
        const result = await (0, governance_service_js_1.approveGovernanceRecommendation)(prisma_js_1.prisma, id, decidedBy, notes);
        res.json(result);
    }
    catch (err) {
        if (err instanceof Error && err.message === "RECOMMENDATION_NOT_FOUND") {
            res.status(404).json({ error: "Recommendation not found" });
            return;
        }
        if (err instanceof Error && err.message === "RECOMMENDATION_NOT_PENDING") {
            res.status(409).json({ error: "Recommendation is not pending" });
            return;
        }
        next(err);
    }
}
async function getGovernanceDrafts(req, res, next) {
    try {
        const payerId = req.query.payerId;
        const status = req.query.status ?? "DRAFT";
        const rows = await prisma_js_1.prisma.governanceDraft.findMany({
            where: {
                status,
                ...(payerId ? { payerId } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        res.json({ success: true, drafts: rows });
    }
    catch (err) {
        next(err);
    }
}
async function getGovernanceDraftDetail(req, res, next) {
    try {
        const id = req.params.draftId;
        const row = await prisma_js_1.prisma.governanceDraft.findUnique({ where: { id } });
        if (!row) {
            res.status(404).json({ error: "Draft not found" });
            return;
        }
        res.json({ success: true, draft: row });
    }
    catch (err) {
        next(err);
    }
}
async function postGovernanceDraftFromRecommendation(req, res, next) {
    try {
        const recommendationId = req.params.recommendationId;
        const draft = await (0, governance_service_js_1.createDraftFromRecommendation)(prisma_js_1.prisma, recommendationId, actorFromReq(req));
        res.status(201).json({ success: true, draft });
    }
    catch (err) {
        if (err instanceof Error && err.message === "RECOMMENDATION_NOT_FOUND") {
            res.status(404).json({ error: "Recommendation not found" });
            return;
        }
        next(err);
    }
}
async function postGovernanceRecommendReject(req, res, next) {
    try {
        const id = req.params.recommendationId;
        const body = learning_schemas_js_1.governanceDecisionBodySchema.parse(req.body ?? {});
        const decidedBy = body.decidedBy ?? body.actor ?? actorFromReq(req);
        const notes = body.notes ?? body.reason;
        const result = await (0, governance_service_js_1.rejectGovernanceRecommendation)(prisma_js_1.prisma, id, decidedBy, notes);
        res.json(result);
    }
    catch (err) {
        if (err instanceof Error && err.message === "RECOMMENDATION_NOT_FOUND") {
            res.status(404).json({ error: "Recommendation not found" });
            return;
        }
        if (err instanceof Error && err.message === "RECOMMENDATION_NOT_PENDING") {
            res.status(409).json({ error: "Recommendation is not pending" });
            return;
        }
        next(err);
    }
}
// ---- Aliases/wrappers used by the newer `/api/learning/*` UI routes ----
exports.evaluateLearning = postGovernanceLearningEvaluate;
exports.listGovernanceRecommendations = getGovernanceRecommendations;
async function extractManualRequirements(req, res, next) {
    try {
        const body = learning_schemas_js_1.manualExtractRequirementsBodySchema.parse(req.body ?? {});
        const manualId = body.manualId;
        const manual = await prisma_js_1.prisma.payerManual.findUnique({ where: { id: manualId } });
        if (!manual) {
            res.status(404).json({ error: "Manual not found" });
            return;
        }
        const { created, candidates } = await (0, manualRequirementExtraction_service_js_1.persistManualRequirementExtractions)(prisma_js_1.prisma, manual.id, manual.payerId, manual.planName, manual.rawText, { useLlm: body.useLlm ?? false });
        await prisma_js_1.prisma.payerManual.update({
            where: { id: manualId },
            data: { parsedStatus: governance_constants_js_1.MANUAL_PARSED_STATUS.PARSED },
        });
        res.json({ success: true, created, candidates, manualId });
    }
    catch (err) {
        if (err instanceof Error && err.message.includes("OPENAI_API_KEY_REQUIRED")) {
            res.status(400).json({ error: err.message });
            return;
        }
        next(err);
    }
}
async function approveGovernanceRecommendation(req, res, next) {
    try {
        const id = req.params.id;
        const body = learning_schemas_js_1.governanceDecisionBodySchema.parse(req.body ?? {});
        const decidedBy = body.decidedBy ?? body.actor ?? actorFromReq(req);
        const notes = body.notes ?? body.reason;
        const result = await (0, governance_service_js_1.approveGovernanceRecommendation)(prisma_js_1.prisma, id, decidedBy, notes);
        res.json(result);
    }
    catch (err) {
        if (err instanceof Error && err.message === "RECOMMENDATION_NOT_FOUND") {
            res.status(404).json({ error: "Recommendation not found" });
            return;
        }
        if (err instanceof Error && err.message === "RECOMMENDATION_NOT_PENDING") {
            res.status(409).json({ error: "Recommendation is not pending" });
            return;
        }
        next(err);
    }
}
async function rejectGovernanceRecommendation(req, res, next) {
    try {
        const id = req.params.id;
        const body = learning_schemas_js_1.governanceDecisionBodySchema.parse(req.body ?? {});
        const decidedBy = body.decidedBy ?? body.actor ?? actorFromReq(req);
        const notes = body.notes ?? body.reason;
        const result = await (0, governance_service_js_1.rejectGovernanceRecommendation)(prisma_js_1.prisma, id, decidedBy, notes);
        res.json(result);
    }
    catch (err) {
        if (err instanceof Error && err.message === "RECOMMENDATION_NOT_FOUND") {
            res.status(404).json({ error: "Recommendation not found" });
            return;
        }
        if (err instanceof Error && err.message === "RECOMMENDATION_NOT_PENDING") {
            res.status(409).json({ error: "Recommendation is not pending" });
            return;
        }
        next(err);
    }
}
//# sourceMappingURL=learning.controller.js.map