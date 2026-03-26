import { describe, expect, it } from "vitest";
import { buildRecoveryStrategy } from "../../src/modules/denials/denial.recovery.service.js";
import { classifyDenialCategory } from "../../src/modules/denials/denial.classifier.js";
import type { DenialIntakeInput } from "../../src/modules/denials/denial.types.js";

describe("denial.classifier", () => {
  it("classifies MISSING_DOCUMENTATION from denialReasonText keywords", () => {
    const input: DenialIntakeInput = {
      payerId: "payer_1",
      denialReasonText: "Missing documentation. Additional documentation required.",
      denialCode: "MISSING_DOC_01",
    };

    const out = classifyDenialCategory(input);
    expect(out.category).toBe("MISSING_DOCUMENTATION");
    expect(out.confidence).toBeGreaterThanOrEqual(0.85);
    expect(out.explanation.join(" ")).toMatch(/missing documentation/i);
  });

  it("classifies MEDICAL_NECESSITY from wording", () => {
    const input: DenialIntakeInput = {
      payerId: "payer_1",
      denialReasonText: "Not medically necessary based on insufficient clinical information.",
    };

    const out = classifyDenialCategory(input);
    expect(out.category).toBe("MEDICAL_NECESSITY");
  });

  it("classifies TIMELY_FILING from late filing wording", () => {
    const input: DenialIntakeInput = {
      payerId: "payer_1",
      denialReasonText: "Late filing beyond the filing deadline.",
    };

    const out = classifyDenialCategory(input);
    expect(out.category).toBe("TIMELY_FILING");
  });

  it("is deterministic (same input -> same output)", () => {
    const input: DenialIntakeInput = {
      payerId: "payer_1",
      denialReasonText: "Coding mismatch. Code does not match diagnosis.",
      denialCode: "CODING_MISMATCH",
    };

    const out1 = classifyDenialCategory(input);
    const out2 = classifyDenialCategory(input);
    expect(out1).toEqual(out2);
  });

  it("recovery strategy aligns with category mapping", () => {
    const input: DenialIntakeInput = {
      payerId: "payer_1",
      denialReasonText: "Form incomplete - missing signature.",
    };
    const classified = classifyDenialCategory(input);
    const recovery = buildRecoveryStrategy(
      input,
      classified.category,
      classified.confidence,
      classified.explanation,
    );
    expect(recovery.requiredAttachments.length).toBeGreaterThan(0);
    expect(recovery.recoveryType).toBeTypeOf("string");
  });
});

