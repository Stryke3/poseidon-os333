"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const governance_constants_js_1 = require("../../governance/governance.constants.js");
const manualRequirement_mapper_js_1 = require("../manualRequirement.mapper.js");
(0, vitest_1.describe)("toManualRequirementCreateManyInput", () => {
    (0, vitest_1.it)("maps extractor rows for createMany", () => {
        const extracted = [
            {
                requirementType: "REQUIRED_DOCUMENT",
                requirementKey: "k1",
                requirementValue: "{}",
                sourceExcerpt: "x",
                confidence: 0.9,
                hcpcsCode: null,
                diagnosisCode: null,
                deviceCategory: null,
                reviewState: governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.AUTO_ACCEPT,
                extractionSource: governance_constants_js_1.MANUAL_EXTRACTION_SOURCE.DETERMINISTIC,
                active: true,
            },
        ];
        const rows = (0, manualRequirement_mapper_js_1.toManualRequirementCreateManyInput)("m1", "p1", "Gold", extracted);
        (0, vitest_1.expect)(rows).toHaveLength(1);
        (0, vitest_1.expect)(rows[0]).toMatchObject({
            manualId: "m1",
            payerId: "p1",
            planName: "Gold",
            requirementKey: "k1",
            reviewState: governance_constants_js_1.MANUAL_REQUIREMENT_REVIEW_STATE.AUTO_ACCEPT,
            extractionSource: governance_constants_js_1.MANUAL_EXTRACTION_SOURCE.DETERMINISTIC,
            active: true,
        });
    });
});
//# sourceMappingURL=manualRequirement.mapper.test.js.map