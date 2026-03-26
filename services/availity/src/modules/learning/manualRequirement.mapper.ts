import type { Prisma } from "@prisma/client";
import type { ManualRequirementCandidate } from "./manualRequirement.types.js";

export function toManualRequirementCreateManyInput(
  manualId: string,
  payerId: string,
  planName: string | null,
  extracted: ManualRequirementCandidate[],
): Prisma.ManualRequirementCreateManyInput[] {
  return extracted.map((r) => ({
    manualId,
    payerId,
    planName,
    deviceCategory: r.deviceCategory,
    hcpcsCode: r.hcpcsCode,
    diagnosisCode: r.diagnosisCode,
    requirementType: r.requirementType,
    requirementKey: r.requirementKey,
    requirementValue: r.requirementValue,
    sourceExcerpt: r.sourceExcerpt,
    confidence: r.confidence,
    reviewState: r.reviewState,
    extractionSource: r.extractionSource,
    active: r.active,
  }));
}
