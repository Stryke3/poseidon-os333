import type { DocumentGeneratorInput } from "../../../schemas/packet.js";
import { scoreDocumentInput } from "./ml-scoring.js";
import { modifyTemplateVariables } from "./template-modifier.js";
import type {
  DocumentPipelineResult,
  PriorAuthDocType,
} from "./types.js";

/**
 * input → ML scoring → template modifier → variables (ready for `renderTemplate`).
 */
export async function runDocumentPipeline(
  docType: PriorAuthDocType,
  input: DocumentGeneratorInput,
  buildBaseVariables: () => Record<string, string>,
): Promise<DocumentPipelineResult> {
  const scores = await scoreDocumentInput(input, docType);
  const baseVariables = buildBaseVariables();
  const variables = modifyTemplateVariables({
    docType,
    input,
    scores,
    baseVariables,
  });
  return { variables, scores };
}
