import type { DocumentGeneratorInput } from "../../../schemas/packet.js";
import type { DocumentPipelineResult, PriorAuthDocType } from "./types.js";
/**
 * input → ML scoring → template modifier → variables (ready for `renderTemplate`).
 */
export declare function runDocumentPipeline(docType: PriorAuthDocType, input: DocumentGeneratorInput, buildBaseVariables: () => Record<string, string>): Promise<DocumentPipelineResult>;
//# sourceMappingURL=run-document-pipeline.d.ts.map