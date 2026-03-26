import type { PrismaClient } from "@prisma/client";
export declare const GOVERNANCE_DRAFT_KIND: {
    readonly PLAYBOOK_REVISION: "PLAYBOOK_REVISION";
    readonly PAYER_RULE_CHANGE: "PAYER_RULE_CHANGE";
};
export declare const GOVERNANCE_DRAFT_STATUS: {
    readonly DRAFT: "DRAFT";
    readonly ARCHIVED: "ARCHIVED";
};
/**
 * Materializes a persisted draft artifact from a queue recommendation (evidence-linked).
 * Does not change production playbooks or payer rules.
 */
export declare function createDraftFromRecommendation(prisma: PrismaClient, recommendationId: string, actor: string): Promise<{
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
//# sourceMappingURL=governance.draft.service.d.ts.map