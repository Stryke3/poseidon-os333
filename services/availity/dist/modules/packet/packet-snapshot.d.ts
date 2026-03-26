import type { Case } from "@prisma/client";
import type { PacketClinicalInput, PacketGenerationSnapshot } from "../../types/packet.js";
export declare function hashSnapshot(snapshot: PacketGenerationSnapshot): string;
export declare function buildPacketGenerationSnapshot(caseRow: Case, clinical: PacketClinicalInput): PacketGenerationSnapshot;
/**
 * Flat keys for `LMN_TEMPLATE` / `SWO_TEMPLATE` ({{patientName}}, {{device}}, etc.).
 * Missing optional clinical strings surface as explicit template markers via the template engine.
 */
export declare function flatTemplateFieldsFromSnapshot(snapshot: PacketGenerationSnapshot): Record<string, unknown>;
export declare function snapshotToRenderContext(snapshot: PacketGenerationSnapshot): Record<string, unknown>;
//# sourceMappingURL=packet-snapshot.d.ts.map