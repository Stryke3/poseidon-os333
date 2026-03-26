import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../lib/prisma.js";
import {
  createDraftFromRecommendation,
  approveGovernanceRecommendation as approveGovernanceRecommendationService,
  rejectGovernanceRecommendation as rejectGovernanceRecommendationService,
} from "./governance.service.js";
import {
  ingestPayerManual,
  manualIngestionService,
  parsePendingPayerManuals,
} from "./manualIngestion.service.js";
import { previewManualExtraction } from "./manualExtraction.service.js";
import { runLearningEvaluation } from "./recommendationEngine.service.js";
import { persistManualRequirementExtractions } from "./manualRequirementExtraction.service.js";
import {
  extractPreviewBodySchema,
  governanceDecisionBodySchema,
  ingestManualBodySchema,
  learningEvaluateBodySchema,
  manualScanBodySchema,
  manualExtractPersistBodySchema,
  manualRequirementDecisionBodySchema,
  manualExtractRequirementsBodySchema,
} from "./learning.schemas.js";
import { scanAndIngestTridentManuals } from "./manualScanIngestion.service.js";
import {
  MANUAL_PARSED_STATUS,
  MANUAL_REQUIREMENT_REVIEW_STATE,
} from "../governance/governance.constants.js";

function actorFromReq(req: Request): string {
  return (req as Request & { userId?: string }).userId ?? "system";
}

export async function postGovernanceManualIngest(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = ingestManualBodySchema.parse(req.body);
    const result = await ingestPayerManual(prisma, body, actorFromReq(req));
    res.status(201).json({ success: true, ...result });
  } catch (err: unknown) {
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
export async function ingestManuals(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const hasSinglePayload =
      typeof body.rawText === "string" ||
      typeof body.relativePath === "string";

    let result: unknown;
    let status = 201;

    if (hasSinglePayload) {
      const parsed = ingestManualBodySchema.parse(body);
      result = await ingestPayerManual(prisma, parsed, actorFromReq(req));
    }

    if (!hasSinglePayload) {
      status = 200;
      const rootOverride = typeof body.root === "string" ? body.root : undefined;
      result = await manualIngestionService.ingestAll({
        root: rootOverride,
        actor: actorFromReq(req),
      });
    }

    const parse = await parsePendingPayerManuals(prisma, {
      actor: actorFromReq(req),
      useLlm: false,
    });

    res.status(status).json({ success: true, result, parse });
    return;
  } catch (err: unknown) {
    next(err);
  }
}

export async function postGovernanceExtractPreview(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = extractPreviewBodySchema.parse(req.body);
    const requirements = await previewManualExtraction(body.rawText, { useLlm: body.useLlm ?? false });
    res.json({
      success: true,
      requirements,
      explainability: body.useLlm
        ? "Deterministic regex extraction plus optional LLM candidates (LLM items are PENDING_REVIEW only)."
        : "Deterministic pattern matches on manual text; set useLlm=true and MANUAL_EXTRACTION_LLM for optional LLM candidates.",
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("OPENAI_API_KEY_REQUIRED")) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
}

export async function postTridentManualsScan(req: Request, res: Response, next: NextFunction) {
  try {
    const body = manualScanBodySchema.parse(req.body ?? {});
    const result = await scanAndIngestTridentManuals(prisma, {
      root: body.root,
      actor: actorFromReq(req),
    });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getGovernanceManuals(req: Request, res: Response, next: NextFunction) {
  try {
    const payerId = req.query.payerId as string | undefined;
    const rows = await prisma.payerManual.findMany({
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
  } catch (err) {
    next(err);
  }
}

export async function postManualExtractPersist(req: Request, res: Response, next: NextFunction) {
  try {
    const manualId = req.params.manualId;
    const body = manualExtractPersistBodySchema.parse(req.body ?? {});
    const manual = await prisma.payerManual.findUnique({ where: { id: manualId } });
    if (!manual) {
      res.status(404).json({ error: "Manual not found" });
      return;
    }
    const { created, candidates } = await persistManualRequirementExtractions(
      prisma,
      manual.id,
      manual.payerId,
      manual.planName,
      manual.rawText,
      { useLlm: body.useLlm ?? false },
    );
    await prisma.payerManual.update({
      where: { id: manualId },
      data: { parsedStatus: MANUAL_PARSED_STATUS.PARSED },
    });
    res.json({ success: true, created, candidates, manualId });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("OPENAI_API_KEY_REQUIRED")) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
}

export async function getManualRequirementReviewQueue(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const payerId = req.query.payerId as string | undefined;
    const reviewState =
      (req.query.reviewState as string | undefined) ?? MANUAL_REQUIREMENT_REVIEW_STATE.PENDING_REVIEW;

    const rows = await prisma.manualRequirement.findMany({
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
  } catch (err) {
    next(err);
  }
}

export async function postManualRequirementApprove(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.manualRequirementId;
    const body = manualRequirementDecisionBodySchema.parse(req.body ?? {});
    const decidedBy = body.decidedBy ?? body.actor ?? actorFromReq(req);

    await prisma.manualRequirement.update({
      where: { id },
      data: { reviewState: MANUAL_REQUIREMENT_REVIEW_STATE.APPROVED, active: true },
    });

    res.json({ success: true, manualRequirementId: id, decidedBy });
  } catch (err) {
    next(err);
  }
}

export async function postManualRequirementReject(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.manualRequirementId;
    const body = manualRequirementDecisionBodySchema.parse(req.body ?? {});
    const decidedBy = body.decidedBy ?? body.actor ?? actorFromReq(req);

    await prisma.manualRequirement.update({
      where: { id },
      data: { reviewState: MANUAL_REQUIREMENT_REVIEW_STATE.REJECTED, active: false },
    });

    res.json({ success: true, manualRequirementId: id, decidedBy });
  } catch (err) {
    next(err);
  }
}

export async function getGovernanceManualDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.manualId;
    const manual = await prisma.payerManual.findUnique({
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
  } catch (err) {
    next(err);
  }
}

export async function postGovernanceLearningEvaluate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = learningEvaluateBodySchema.parse(req.body);
    const result = await runLearningEvaluation(prisma, {
      periodDays: body.periodDays,
      payerId: body.payerId,
      actor: actorFromReq(req),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getGovernanceRecommendations(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const status = (req.query.status as string | undefined) ?? "PENDING";
    const rows = await prisma.governanceRecommendation.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ success: true, recommendations: rows });
  } catch (err) {
    next(err);
  }
}

export async function getPlaybookPerformanceDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const payerId = req.query.payerId as string | undefined;
    const playbookId = req.query.playbookId as string | undefined;
    const rows = await prisma.playbookPerformance.findMany({
      where: {
        ...(payerId ? { payerId } : {}),
        ...(playbookId ? { playbookId } : {}),
      },
      orderBy: { calculatedAt: "desc" },
      take: 100,
    });
    res.json({ success: true, performances: rows });
  } catch (err) {
    next(err);
  }
}

export async function getLearnedRuleSuggestions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const status = (req.query.status as string | undefined) ?? "DRAFT";
    const payerId = req.query.payerId as string | undefined;
    const rows = await prisma.learnedRuleSuggestion.findMany({
      where: { status, ...(payerId ? { payerId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ success: true, suggestions: rows });
  } catch (err) {
    next(err);
  }
}

export async function postGovernanceRecommendApprove(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.recommendationId;
    const body = governanceDecisionBodySchema.parse(req.body ?? {});
    const decidedBy = body.decidedBy ?? body.actor ?? actorFromReq(req);
    const notes = body.notes ?? body.reason;
    const result = await approveGovernanceRecommendationService(prisma, id, decidedBy, notes);
    res.json(result);
  } catch (err: unknown) {
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

export async function getGovernanceDrafts(req: Request, res: Response, next: NextFunction) {
  try {
    const payerId = req.query.payerId as string | undefined;
    const status = (req.query.status as string | undefined) ?? "DRAFT";
    const rows = await prisma.governanceDraft.findMany({
      where: {
        status,
        ...(payerId ? { payerId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ success: true, drafts: rows });
  } catch (err) {
    next(err);
  }
}

export async function getGovernanceDraftDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.draftId;
    const row = await prisma.governanceDraft.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }
    res.json({ success: true, draft: row });
  } catch (err) {
    next(err);
  }
}

export async function postGovernanceDraftFromRecommendation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const recommendationId = req.params.recommendationId;
    const draft = await createDraftFromRecommendation(prisma, recommendationId, actorFromReq(req));
    res.status(201).json({ success: true, draft });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "RECOMMENDATION_NOT_FOUND") {
      res.status(404).json({ error: "Recommendation not found" });
      return;
    }
    next(err);
  }
}

export async function postGovernanceRecommendReject(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.recommendationId;
    const body = governanceDecisionBodySchema.parse(req.body ?? {});
    const decidedBy = body.decidedBy ?? body.actor ?? actorFromReq(req);
    const notes = body.notes ?? body.reason;
    const result = await rejectGovernanceRecommendationService(prisma, id, decidedBy, notes);
    res.json(result);
  } catch (err: unknown) {
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
export const evaluateLearning = postGovernanceLearningEvaluate;
export const listGovernanceRecommendations = getGovernanceRecommendations;

export async function extractManualRequirements(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = manualExtractRequirementsBodySchema.parse(req.body ?? {});
    const manualId = body.manualId;
    const manual = await prisma.payerManual.findUnique({ where: { id: manualId } });
    if (!manual) {
      res.status(404).json({ error: "Manual not found" });
      return;
    }

    const { created, candidates } = await persistManualRequirementExtractions(
      prisma,
      manual.id,
      manual.payerId,
      manual.planName,
      manual.rawText,
      { useLlm: body.useLlm ?? false },
    );

    await prisma.payerManual.update({
      where: { id: manualId },
      data: { parsedStatus: MANUAL_PARSED_STATUS.PARSED },
    });

    res.json({ success: true, created, candidates, manualId });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("OPENAI_API_KEY_REQUIRED")) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
}

export async function approveGovernanceRecommendation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id;
    const body = governanceDecisionBodySchema.parse(req.body ?? {});
    const decidedBy = body.decidedBy ?? body.actor ?? actorFromReq(req);
    const notes = body.notes ?? body.reason;
    const result = await approveGovernanceRecommendationService(prisma, id, decidedBy, notes);
    res.json(result);
  } catch (err: unknown) {
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

export async function rejectGovernanceRecommendation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const id = req.params.id;
    const body = governanceDecisionBodySchema.parse(req.body ?? {});
    const decidedBy = body.decidedBy ?? body.actor ?? actorFromReq(req);
    const notes = body.notes ?? body.reason;
    const result = await rejectGovernanceRecommendationService(prisma, id, decidedBy, notes);
    res.json(result);
  } catch (err: unknown) {
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
