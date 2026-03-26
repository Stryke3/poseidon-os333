import type { PriorAuthPacket } from "@prisma/client";
import type { DocumentGeneratorInput } from "../../schemas/packet.js";
/**
 * Builds an LMN + SWO pair via {@link documentGeneratorService}, then persists a
 * {@link PriorAuthPacket} with `documents: { documentIds }` (hydration-compatible)
 * and a submission-oriented `payload` (patient / device / physician / attachments + trace fields).
 */
export declare class PriorAuthPacketService {
    buildPacket(caseId: string, input: DocumentGeneratorInput): Promise<PriorAuthPacket>;
}
export declare const priorAuthPacketService: PriorAuthPacketService;
//# sourceMappingURL=prior-auth-packet.service.d.ts.map