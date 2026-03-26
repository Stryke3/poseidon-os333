import type { PriorAuthPacketJson } from "../../types/packet.js";
import type { ApplyPlaybookPacket, ApplyPlaybookResult, Playbook, PlaybookExecutorResult } from "./playbook.types.js";
/**
 * Apply playbook document rules + required-document checks on an attachment-shaped packet.
 * Mutates a shallow copy of `attachments` only; returns a new `updatedPacket`.
 * Appended payer rule text includes a visible header (playbook id + version + document type).
 */
export declare function applyPlaybook(packet: ApplyPlaybookPacket, playbook: Playbook): ApplyPlaybookResult;
export declare function executePlaybookOnPacketJson(playbook: Playbook, packetView: PriorAuthPacketJson): PlaybookExecutorResult;
//# sourceMappingURL=playbook.executor.d.ts.map