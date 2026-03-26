import { describe, expect, it } from "vitest";
import { buildRecoveryStrategy } from "../../src/modules/denials/denial.recovery.service.js";
import type { DenialCategory, DenialIntakeInput } from "../../src/modules/denials/denial.types.js";

describe("denial.recovery.service", () => {
  const baseInput: DenialIntakeInput = {
    payerId: "payer_1",
    denialReasonText: "irrelevant for this unit test",
  };

  it("maps MISSING_DOCUMENTATION -> RESUBMIT", () => {
    const out = buildRecoveryStrategy(baseInput, "MISSING_DOCUMENTATION", 0.9, [
      "missing documentation wording match",
    ]);
    expect(out.recoveryType).toBe("RESUBMIT");
    expect(out.requiredAttachments).toContain("LMN");
  });

  it("maps MEDICAL_NECESSITY -> APPEAL", () => {
    const out = buildRecoveryStrategy(baseInput, "MEDICAL_NECESSITY", 0.9, [
      "medical necessity wording match",
    ]);
    expect(out.recoveryType).toBe("APPEAL");
    expect(out.requiredAttachments).toContain("LMN");
  });

  it("produces deterministic unique arrays", () => {
    const out1 = buildRecoveryStrategy(baseInput, "DUPLICATE", 0.7, ["dup match"]);
    const out2 = buildRecoveryStrategy(baseInput, "DUPLICATE", 0.7, ["dup match"]);
    expect(out1).toEqual(out2);
  });
});

