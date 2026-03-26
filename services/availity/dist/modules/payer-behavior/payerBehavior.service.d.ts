import type { PrismaClient } from "@prisma/client";
import type { CreatePayerRuleBody, IngestOutcomeBody, ScorePriorAuthBody } from "./payerBehavior.schemas.js";
import type { ScoreCaseInput, ScoreCaseResult } from "./payerBehavior.types.js";
export declare class PayerBehaviorService {
    private readonly prisma;
    private readonly statsService;
    constructor(prisma: PrismaClient);
    /**
     * Score using persisted rules (plan-global + plan-specific) and stats for the same scope as `getStats`.
     */
    scoreCase(input: ScoreCaseInput, actor?: string): Promise<{
        snapshotId: string;
        score: ScoreCaseResult;
    }>;
    scorePriorAuth(body: ScorePriorAuthBody, actor: string): Promise<{
        snapshot: {
            id: string;
        };
        score: ScoreCaseResult;
    }>;
    ingestOutcome(body: IngestOutcomeBody, actor: string): Promise<{
        caseId: string | null;
        payerId: string;
        id: string;
        createdAt: Date;
        planName: string | null;
        deviceCategory: string | null;
        hcpcsCode: string | null;
        diagnosisCode: string | null;
        physicianName: string | null;
        facilityName: string | null;
        outcome: string;
        denialReason: string | null;
        turnaroundDays: number | null;
        submittedAt: Date | null;
        resolvedAt: Date | null;
        playbookExecutionId: string | null;
        playbookId: string | null;
        playbookVersion: number | null;
        payerRuleSnapshot: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    listRules(payerId: string): Promise<{
        payerId: string;
        id: string;
        createdAt: Date;
        active: boolean;
        planName: string | null;
        deviceCategory: string | null;
        hcpcsCode: string | null;
        diagnosisCode: string | null;
        requiresLmn: boolean;
        requiresSwo: boolean;
        requiresClinicals: boolean;
        requiresAuth: boolean;
        notes: string | null;
        updatedAt: Date;
    }[]>;
    createRule(body: CreatePayerRuleBody, actor: string): Promise<{
        payerId: string;
        id: string;
        createdAt: Date;
        active: boolean;
        planName: string | null;
        deviceCategory: string | null;
        hcpcsCode: string | null;
        diagnosisCode: string | null;
        requiresLmn: boolean;
        requiresSwo: boolean;
        requiresClinicals: boolean;
        requiresAuth: boolean;
        notes: string | null;
        updatedAt: Date;
    }>;
}
export declare function createPayerBehaviorService(prisma: PrismaClient): PayerBehaviorService;
export declare const payerBehaviorService: PayerBehaviorService;
//# sourceMappingURL=payerBehavior.service.d.ts.map