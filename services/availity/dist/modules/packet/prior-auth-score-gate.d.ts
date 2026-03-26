import type { PrismaClient } from "@prisma/client";
import type { PayerBehaviorService } from "../payer-behavior/payerBehavior.service.js";
import type { ScorePriorAuthBody } from "../payer-behavior/payerBehavior.schemas.js";
import type { ScoreCaseResult } from "../payer-behavior/payerBehavior.types.js";
export type PriorAuthScoreGateOutcome = {
    kind: "BLOCKED";
    snapshotId: string;
    score: ScoreCaseResult;
} | {
    kind: "NEEDS_REVIEW";
    snapshotId: string;
    score: ScoreCaseResult;
} | {
    kind: "ALLOW_SUBMIT";
    snapshotId: string;
    score: ScoreCaseResult;
};
export declare function classifyPriorAuthScoreGate(snapshotId: string, score: ScoreCaseResult): PriorAuthScoreGateOutcome;
/** Reconstruct API score shape + workflow from a persisted snapshot row. */
export declare function payerScoreSnapshotToResult(row: {
    approvalProbability: number;
    riskLevel: string;
    predictedDenialReasons: unknown;
    missingRequirements: unknown;
    recommendedAction: string;
    explanation: unknown;
}): ScoreCaseResult;
export declare function buildScorePriorAuthBodyFromPacket(prisma: PrismaClient, packetId: string): Promise<ScorePriorAuthBody>;
/**
 * Runs payer behavior scoring for a packet, persists `payerScoreSnapshotId` on the packet, and
 * returns the gate outcome (block / manual review / allow Availity submit).
 */
export declare function scorePacketForPriorAuthGate(prisma: PrismaClient, payerBehavior: PayerBehaviorService, packetId: string, actor: string): Promise<PriorAuthScoreGateOutcome>;
export declare function scorePriorAuthSubmissionContext(prisma: PrismaClient, payerBehavior: PayerBehaviorService, opts: {
    packetId?: string;
    caseId?: string;
}, actor: string): Promise<{
    outcome: PriorAuthScoreGateOutcome;
    resolvedPacketId: string | null;
}>;
//# sourceMappingURL=prior-auth-score-gate.d.ts.map