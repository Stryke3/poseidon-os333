import type { PrismaClient } from "@prisma/client";
import { approveGovernanceRecommendation, rejectGovernanceRecommendation } from "../governance/governance.decision.service.js";
import { createDraftFromRecommendation } from "../governance/governance.draft.service.js";
export declare class GovernanceService {
    private readonly db;
    constructor(db?: PrismaClient);
    approveRecommendation(recommendationId: string, decidedBy: string, notes?: string): Promise<{
        payerId: string;
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        recommendationType: string;
        targetId: string | null;
        targetType: string | null;
        draftPayload: import("@prisma/client/runtime/library").JsonValue;
        evidence: import("@prisma/client/runtime/library").JsonValue;
        rationale: string;
    } | null>;
    rejectRecommendation(recommendationId: string, decidedBy: string, notes?: string): Promise<{
        payerId: string;
        status: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        recommendationType: string;
        targetId: string | null;
        targetType: string | null;
        draftPayload: import("@prisma/client/runtime/library").JsonValue;
        evidence: import("@prisma/client/runtime/library").JsonValue;
        rationale: string;
    } | null>;
    createDraftFromRecommendationForQueueItem(recommendationId: string, actor: string): Promise<{
        payerId: string;
        status: string;
        payload: import("@prisma/client/runtime/library").JsonValue;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        kind: string;
        recommendationId: string | null;
        title: string | null;
    }>;
}
export declare const governanceService: GovernanceService;
export { createDraftFromRecommendation, approveGovernanceRecommendation, rejectGovernanceRecommendation };
//# sourceMappingURL=governance.service.d.ts.map