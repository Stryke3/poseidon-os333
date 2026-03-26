import type { PrismaClient } from "@prisma/client";
export declare function approveGovernanceRecommendation(prisma: PrismaClient, recommendationId: string, decidedBy: string, notes?: string): Promise<{
    success: true;
    recommendationId: string;
}>;
export declare function rejectGovernanceRecommendation(prisma: PrismaClient, recommendationId: string, decidedBy: string, notes?: string): Promise<{
    success: true;
    recommendationId: string;
}>;
//# sourceMappingURL=governance.decision.service.d.ts.map