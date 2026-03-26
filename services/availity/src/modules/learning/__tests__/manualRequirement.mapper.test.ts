import { describe, expect, it } from "vitest";
import {
  MANUAL_EXTRACTION_SOURCE,
  MANUAL_REQUIREMENT_REVIEW_STATE,
} from "../../governance/governance.constants.js";
import { toManualRequirementCreateManyInput } from "../manualRequirement.mapper.js";
import type { ManualRequirementCandidate } from "../manualRequirement.types.js";

describe("toManualRequirementCreateManyInput", () => {
  it("maps extractor rows for createMany", () => {
    const extracted: ManualRequirementCandidate[] = [
      {
        requirementType: "REQUIRED_DOCUMENT",
        requirementKey: "k1",
        requirementValue: "{}",
        sourceExcerpt: "x",
        confidence: 0.9,
        hcpcsCode: null,
        diagnosisCode: null,
        deviceCategory: null,
        reviewState: MANUAL_REQUIREMENT_REVIEW_STATE.AUTO_ACCEPT,
        extractionSource: MANUAL_EXTRACTION_SOURCE.DETERMINISTIC,
        active: true,
      },
    ];
    const rows = toManualRequirementCreateManyInput("m1", "p1", "Gold", extracted);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      manualId: "m1",
      payerId: "p1",
      planName: "Gold",
      requirementKey: "k1",
      reviewState: MANUAL_REQUIREMENT_REVIEW_STATE.AUTO_ACCEPT,
      extractionSource: MANUAL_EXTRACTION_SOURCE.DETERMINISTIC,
      active: true,
    });
  });
});
