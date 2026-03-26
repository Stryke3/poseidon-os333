import type { Prisma, PrismaClient } from "@prisma/client";
import type { PacketClinicalInput, PriorAuthPacketJson } from "../../types/packet.js";
export declare function generatePacketCore(tx: Prisma.TransactionClient, packetId: string, clinical: PacketClinicalInput, actor: string): Promise<PriorAuthPacketJson>;
export declare function createPacketWithInitialGeneration(prisma: PrismaClient, params: {
    caseId: string;
    deviceType?: string;
    clinical: PacketClinicalInput;
    actor: string;
}): Promise<{
    packetId: string;
    packetJson: PriorAuthPacketJson;
}>;
export declare function regeneratePacket(prisma: PrismaClient, params: {
    packetId: string;
    clinical: PacketClinicalInput;
    actor: string;
}): Promise<PriorAuthPacketJson>;
//# sourceMappingURL=packet-generator.service.d.ts.map