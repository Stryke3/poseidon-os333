import type { Request, Response, NextFunction } from "express";
export declare function postGovernanceManualIngest(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * POST /api/learning/manuals/ingest
 * - If request includes `rawText` or `relativePath`, falls back to single-manual ingest.
 * - Otherwise performs local recursive scan ingestion from the configured Trident manuals root.
 */
export declare function ingestManuals(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function postGovernanceExtractPreview(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function postTridentManualsScan(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getGovernanceManuals(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function postManualExtractPersist(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getManualRequirementReviewQueue(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function postManualRequirementApprove(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function postManualRequirementReject(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getGovernanceManualDetail(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function postGovernanceLearningEvaluate(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getGovernanceRecommendations(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getPlaybookPerformanceDashboard(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getLearnedRuleSuggestions(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function postGovernanceRecommendApprove(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getGovernanceDrafts(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function getGovernanceDraftDetail(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function postGovernanceDraftFromRecommendation(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function postGovernanceRecommendReject(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare const evaluateLearning: typeof postGovernanceLearningEvaluate;
export declare const listGovernanceRecommendations: typeof getGovernanceRecommendations;
export declare function extractManualRequirements(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function approveGovernanceRecommendation(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function rejectGovernanceRecommendation(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=learning.controller.d.ts.map