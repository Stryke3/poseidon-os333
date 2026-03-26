import type { PriorAuthPacketJson } from "../../types/packet.js";
export type PlaybookStrategyTiming = "IMMEDIATE" | "DELAY" | "REVIEW";
/** Domain playbook (persisted JSON on `PayerPlaybook` + matching columns). */
export type Playbook = {
    id: string;
    payerId: string;
    planName?: string;
    deviceCategory?: string;
    hcpcsCode?: string;
    diagnosisCode?: string;
    strategy: {
        requiredDocuments?: string[];
        timing?: PlaybookStrategyTiming;
    };
    documentRules: {
        lmnAdditions?: string[];
        clinicalAdditions?: string[];
    };
    escalationRules: {
        onDenial?: string[];
        peerToPeer?: boolean;
    };
    version: number;
};
/** Public result of applying a playbook to a packet (traceable `modifications` strings). */
export type PlaybookExecutionResult = {
    playbookId: string;
    version: number;
    modifications: string[];
    updatedPacket: PriorAuthPacketJson;
};
/**
 * Executor output including DB persistence fields (stripped from API when desired).
 */
export type PlaybookExecutorResult = PlaybookExecutionResult & {
    modifiedDocumentIds: string[];
    payloadPatch: Record<string, unknown>;
    textAmendments: PlaybookTextAmendment[];
};
export type PlaybookMatchContext = {
    payerId: string;
    planName?: string;
    deviceCategory?: string;
    hcpcsCode?: string;
    diagnosisCodes: string[];
};
/** Attachment-shaped packet used by {@link applyPlaybook} (`type` is e.g. LMN, SWO; `requiredDocuments` entries match these). */
export type PlaybookAttachment = {
    type: string;
    content: string;
};
export type ApplyPlaybookPacket = {
    attachments: PlaybookAttachment[];
};
/** Explicit record of payer-authored text merged into a document (for audit/UI). */
export type PlaybookTextAmendment = {
    documentType: string;
    addition: string;
    playbookId: string;
    playbookVersion: number;
};
/** Result of {@link applyPlaybook} before hydration back to {@link PriorAuthPacketJson}. */
export type ApplyPlaybookResult = {
    playbookId: string;
    version: number;
    modifications: string[];
    /** Same additions as embedded in attachment content, for snapshots and APIs. */
    textAmendments: PlaybookTextAmendment[];
    updatedPacket: ApplyPlaybookPacket;
};
/** Input for {@link PlaybookService.execute} (attachment-shaped packet + payer match fields). */
export type PlaybookExecuteInput = {
    caseId?: string;
    payerId: string;
    planName?: string;
    deviceCategory?: string;
    hcpcsCode?: string;
    diagnosisCode?: string;
    packet: ApplyPlaybookPacket;
    /** Defaults to `"system"` in audit records if omitted. */
    actor?: string;
};
/** Result of {@link PlaybookService.execute}; `playbookId` / `version` null when no playbook matched. */
export type PlaybookExecuteResult = {
    /** Always set: row in `playbook_executions` for this run. */
    executionId: string;
    playbookId: string | null;
    version: number | null;
    modifications: string[];
    textAmendments: PlaybookTextAmendment[];
    updatedPacket: ApplyPlaybookPacket;
};
//# sourceMappingURL=playbook.types.d.ts.map