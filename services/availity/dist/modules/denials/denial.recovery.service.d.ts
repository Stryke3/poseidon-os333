import type { DenialCategory, DenialClassificationResult, DenialIntakeInput } from "./denial.types.js";
/**
 * Deterministic recovery strategy generator (category → recovery plan).
 * Does not invent clinical facts. It only requests fixes/attachments based on denial category.
 */
export declare function buildRecoveryStrategy(input: DenialIntakeInput, category: DenialCategory, confidence: number, baseExplanation: string[]): Omit<DenialClassificationResult, "category" | "confidence">;
declare class DenialRecoveryService {
    intake(input: {
        caseId?: string;
        payerId: string;
        planName?: string;
        authId?: string;
        denialCode?: string;
        denialReasonText: string;
        packetId?: string;
        playbookId?: string;
        playbookVersion?: number;
        scoreSnapshotId?: string;
    }): Promise<{
        caseId: string | null;
        payerId: string;
        packetId: string | null;
        authId: string | null;
        id: string;
        createdAt: Date;
        planName: string | null;
        playbookId: string | null;
        playbookVersion: number | null;
        denialCode: string | null;
        denialReasonText: string;
        scoreSnapshotId: string | null;
        denialCategory: string | null;
    }>;
    classifyAndSnapshot(denialEventId: string): Promise<{
        id: string;
        createdAt: Date;
        explanation: import("@prisma/client/runtime/library").JsonValue;
        confidence: number | null;
        category: string;
        denialEventId: string;
        recoveryType: string;
        requiredFixes: import("@prisma/client/runtime/library").JsonValue;
        requiredAttachments: import("@prisma/client/runtime/library").JsonValue;
        escalationSteps: import("@prisma/client/runtime/library").JsonValue;
    }>;
    generateRecoveryPacket(input: {
        denialEventId: string;
        patientName?: string;
        device?: string;
        physicianName?: string;
        rebuttalFacts?: string[];
    }): Promise<{
        appealPacket: {
            caseId: string | null;
            status: string;
            payload: import("@prisma/client/runtime/library").JsonValue;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            denialEventId: string;
            recoveryType: string;
            letterText: string | null;
            rebuttalPoints: import("@prisma/client/runtime/library").JsonValue;
            attachmentChecklist: import("@prisma/client/runtime/library").JsonValue;
        };
        classification: DenialClassificationResult;
    }>;
}
export declare const denialRecoveryService: DenialRecoveryService;
export {};
//# sourceMappingURL=denial.recovery.service.d.ts.map