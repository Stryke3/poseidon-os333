import type { Prisma, PrismaClient } from "@prisma/client";
import type { PacketClinicalInput, PriorAuthPacketJson } from "../../types/packet.js";
import { type CreatePlaybookBody } from "./playbook.schemas.js";
import type { Playbook, PlaybookExecuteInput, PlaybookExecuteResult, PlaybookMatchContext } from "./playbook.types.js";
import type { PayerPlaybook } from "@prisma/client";
export declare function toPlaybook(row: PayerPlaybook): Playbook;
export declare function applyPlaybookAfterPacketGeneration(tx: Prisma.TransactionClient, params: {
    packetId: string;
    caseId: string;
    clinical: PacketClinicalInput;
    packetView: PriorAuthPacketJson;
    actor: string;
    planName?: string;
}): Promise<PriorAuthPacketJson>;
export declare class PlaybookService {
    private readonly db;
    constructor(db: PrismaClient);
    createPlaybook(body: CreatePlaybookBody, actor: string): Promise<PayerPlaybook>;
    listByPayerId(payerId: string, opts?: {
        includeInactive?: boolean;
    }): Promise<{
        payerId: string;
        id: string;
        createdAt: Date;
        active: boolean;
        version: number;
        planName: string | null;
        deviceCategory: string | null;
        hcpcsCode: string | null;
        diagnosisCode: string | null;
        updatedAt: Date;
        strategy: Prisma.JsonValue;
        documentRules: Prisma.JsonValue;
        escalationRules: Prisma.JsonValue;
    }[]>;
    /**
     * Match an active playbook by payer + specificity fields, apply document rules on an
     * attachment-shaped packet, and record a `PlaybookExecution`. For full prior-auth packets
     * use {@link executeOnPacket} (hydrated view + DB document updates).
     */
    execute(input: PlaybookExecuteInput): Promise<PlaybookExecuteResult>;
    matchPlaybooks(ctx: PlaybookMatchContext): Promise<{
        context: PlaybookMatchContext;
        ranked: {
            id: string;
            version: number;
            specificityFields: {
                planName: boolean;
                deviceCategory: boolean;
                hcpcsCode: boolean;
                diagnosisCode: boolean;
            };
        }[];
        best: {
            id: string;
            version: number;
        } | null;
    }>;
    executeOnPacket(params: {
        packetId: string;
        playbookId?: string;
        actor: string;
        runPayerScore?: boolean;
    }): Promise<{
        success: true;
        executionId: string;
        playbookId: string;
        version: number;
        modifications: string[];
        textAmendments: import("./playbook.types.js").PlaybookTextAmendment[];
        updatedPacket: PriorAuthPacketJson;
        payerScoreSnapshotId: string | null;
    }>;
}
export declare const playbookService: PlaybookService;
export declare function createPlaybookService(db: PrismaClient): PlaybookService;
//# sourceMappingURL=playbook.service.d.ts.map