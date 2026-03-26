import type { PriorAuthDocument } from "@prisma/client";
import type { DocumentGeneratorInput } from "../../schemas/packet.js";
export type { DocumentGeneratorInput } from "../../schemas/packet.js";
export declare class DocumentGeneratorService {
    generateLMN(caseId: string, input: DocumentGeneratorInput): Promise<PriorAuthDocument>;
    generateSWO(caseId: string, input: DocumentGeneratorInput): Promise<PriorAuthDocument>;
}
export declare const documentGeneratorService: DocumentGeneratorService;
//# sourceMappingURL=document-generator.service.d.ts.map