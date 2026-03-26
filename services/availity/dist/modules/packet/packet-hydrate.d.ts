import type { PriorAuthDocument } from "@prisma/client";
import type { PriorAuthPacketJson } from "../../types/packet.js";
export declare function parseDocumentRefs(documentsJson: unknown): string[];
export declare function hydratePriorAuthPacketView(params: {
    id: string;
    caseId: string;
    status: string;
    documentsJson: unknown;
    payloadJson: unknown;
    rows: PriorAuthDocument[];
    updatedAt: Date;
}): PriorAuthPacketJson;
//# sourceMappingURL=packet-hydrate.d.ts.map