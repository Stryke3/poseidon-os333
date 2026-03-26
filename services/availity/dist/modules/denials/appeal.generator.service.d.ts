import type { DenialEventPayload, DenialClassificationResult } from "./denial.types.js";
type PacketDoc = {
    type: string;
    content: string;
};
/**
 * Generate appeal/resubmission draft using only:
 * - denial code/reason text
 * - packet document content (no invented clinical facts)
 * - deterministic classification/recovery instructions
 *
 * Every string is traceable to one of the inputs; no hidden medical reasoning.
 */
export declare function generateAppealDraft(params: {
    denial: DenialEventPayload;
    classification: DenialClassificationResult;
    packetDocs: PacketDoc[];
    classificationSnapshotId?: string | null;
}): {
    letterText: string;
    rebuttalPoints: string[];
    attachmentChecklist: string[];
    payload: Record<string, unknown>;
};
export {};
//# sourceMappingURL=appeal.generator.service.d.ts.map