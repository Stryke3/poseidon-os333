import { Router } from "express";
import {
  getGovernanceDraftDetail,
  getGovernanceDrafts,
  getGovernanceManualDetail,
  getGovernanceManuals,
  getGovernanceRecommendations,
  getLearnedRuleSuggestions,
  getPlaybookPerformanceDashboard,
  getManualRequirementReviewQueue,
  postGovernanceDraftFromRecommendation,
  postGovernanceExtractPreview,
  postGovernanceLearningEvaluate,
  postGovernanceManualIngest,
  postGovernanceRecommendApprove,
  postGovernanceRecommendReject,
  postTridentManualsScan,
  postManualExtractPersist,
  postManualRequirementApprove,
  postManualRequirementReject,
  ingestManuals,
  extractManualRequirements,
  evaluateLearning,
  listGovernanceRecommendations,
  approveGovernanceRecommendation,
  rejectGovernanceRecommendation,
} from "./learning.controller.js";

const router = Router();

// New UI routes (mounted at `/api/learning`):
router.post("/manuals/ingest", ingestManuals);
router.post("/manuals/extract", extractManualRequirements);
router.post("/evaluate", evaluateLearning);
router.get("/governance/recommendations", listGovernanceRecommendations);
router.post("/governance/:id/approve", approveGovernanceRecommendation);
router.post("/governance/:id/reject", rejectGovernanceRecommendation);

// Legacy routes (kept for compatibility):
router.post("/manuals/scan", postTridentManualsScan);
router.post("/manuals/extract-preview", postGovernanceExtractPreview);
router.post("/manuals/:manualId/extract", postManualExtractPersist);
router.get("/manuals", getGovernanceManuals);
router.get("/manuals/:manualId", getGovernanceManualDetail);

router.post("/learning/evaluate", postGovernanceLearningEvaluate);
router.get("/recommendations", getGovernanceRecommendations);
router.post("/recommendations/:recommendationId/approve", postGovernanceRecommendApprove);
router.post("/recommendations/:recommendationId/reject", postGovernanceRecommendReject);
router.post(
  "/recommendations/:recommendationId/draft",
  postGovernanceDraftFromRecommendation,
);

router.get("/drafts", getGovernanceDrafts);
router.get("/drafts/:draftId", getGovernanceDraftDetail);

router.get("/playbook-performance", getPlaybookPerformanceDashboard);
router.get("/learned-rule-suggestions", getLearnedRuleSuggestions);

router.get("/manual-requirements/review-queue", getManualRequirementReviewQueue);
router.post(
  "/manual-requirements/:manualRequirementId/approve",
  postManualRequirementApprove,
);
router.post(
  "/manual-requirements/:manualRequirementId/reject",
  postManualRequirementReject,
);

export default router;
