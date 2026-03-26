import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  approveGovernanceRecommendation,
  rejectGovernanceRecommendation,
} from "../governance/governance.decision.service.js";
import { createDraftFromRecommendation } from "../governance/governance.draft.service.js";

export class GovernanceService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async approveRecommendation(
    recommendationId: string,
    decidedBy: string,
    notes?: string,
  ) {
    await approveGovernanceRecommendation(this.db, recommendationId, decidedBy, notes);
    return this.db.governanceRecommendation.findUnique({
      where: { id: recommendationId },
    });
  }

  async rejectRecommendation(
    recommendationId: string,
    decidedBy: string,
    notes?: string,
  ) {
    await rejectGovernanceRecommendation(this.db, recommendationId, decidedBy, notes);
    return this.db.governanceRecommendation.findUnique({
      where: { id: recommendationId },
    });
  }

  async createDraftFromRecommendationForQueueItem(recommendationId: string, actor: string) {
    return createDraftFromRecommendation(this.db, recommendationId, actor);
  }
}

export const governanceService = new GovernanceService();

export { createDraftFromRecommendation, approveGovernanceRecommendation, rejectGovernanceRecommendation };
