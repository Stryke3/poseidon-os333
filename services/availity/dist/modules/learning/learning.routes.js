"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const learning_controller_js_1 = require("./learning.controller.js");
const router = (0, express_1.Router)();
// New UI routes (mounted at `/api/learning`):
router.post("/manuals/ingest", learning_controller_js_1.ingestManuals);
router.post("/manuals/extract", learning_controller_js_1.extractManualRequirements);
router.post("/evaluate", learning_controller_js_1.evaluateLearning);
router.get("/governance/recommendations", learning_controller_js_1.listGovernanceRecommendations);
router.post("/governance/:id/approve", learning_controller_js_1.approveGovernanceRecommendation);
router.post("/governance/:id/reject", learning_controller_js_1.rejectGovernanceRecommendation);
// Legacy routes (kept for compatibility):
router.post("/manuals/scan", learning_controller_js_1.postTridentManualsScan);
router.post("/manuals/extract-preview", learning_controller_js_1.postGovernanceExtractPreview);
router.post("/manuals/:manualId/extract", learning_controller_js_1.postManualExtractPersist);
router.get("/manuals", learning_controller_js_1.getGovernanceManuals);
router.get("/manuals/:manualId", learning_controller_js_1.getGovernanceManualDetail);
router.post("/learning/evaluate", learning_controller_js_1.postGovernanceLearningEvaluate);
router.get("/recommendations", learning_controller_js_1.getGovernanceRecommendations);
router.post("/recommendations/:recommendationId/approve", learning_controller_js_1.postGovernanceRecommendApprove);
router.post("/recommendations/:recommendationId/reject", learning_controller_js_1.postGovernanceRecommendReject);
router.post("/recommendations/:recommendationId/draft", learning_controller_js_1.postGovernanceDraftFromRecommendation);
router.get("/drafts", learning_controller_js_1.getGovernanceDrafts);
router.get("/drafts/:draftId", learning_controller_js_1.getGovernanceDraftDetail);
router.get("/playbook-performance", learning_controller_js_1.getPlaybookPerformanceDashboard);
router.get("/learned-rule-suggestions", learning_controller_js_1.getLearnedRuleSuggestions);
router.get("/manual-requirements/review-queue", learning_controller_js_1.getManualRequirementReviewQueue);
router.post("/manual-requirements/:manualRequirementId/approve", learning_controller_js_1.postManualRequirementApprove);
router.post("/manual-requirements/:manualRequirementId/reject", learning_controller_js_1.postManualRequirementReject);
exports.default = router;
//# sourceMappingURL=learning.routes.js.map