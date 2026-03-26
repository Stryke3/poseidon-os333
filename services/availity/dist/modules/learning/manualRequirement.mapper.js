"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toManualRequirementCreateManyInput = toManualRequirementCreateManyInput;
function toManualRequirementCreateManyInput(manualId, payerId, planName, extracted) {
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
//# sourceMappingURL=manualRequirement.mapper.js.map