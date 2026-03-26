import { describe, expect, it } from "vitest";
import { previewManualExtraction } from "../manualExtraction.service.js";
import { REQUIREMENT_TYPE } from "../../governance/governance.constants.js";

describe("previewManualExtraction", () => {
  it("extracts stable LMN, PA, restriction, and escalation requirements", async () => {
    const text = `
      Section 3. Submit a Letter of Medical Necessity (LMN) with prior authorization via the Availity portal.
      Appeals and peer-to-peer must follow the standard process within 14 business days.
    `;
    const out = await previewManualExtraction(text);
    const types = new Set(out.map((r) => r.requirementType));
    expect(types.has(REQUIREMENT_TYPE.REQUIRED_DOCUMENT)).toBe(true);
    expect(types.has(REQUIREMENT_TYPE.AUTH_REQUIRED)).toBe(true);
    expect(types.has(REQUIREMENT_TYPE.ESCALATION)).toBe(true);
    expect(types.has(REQUIREMENT_TYPE.RESTRICTION)).toBe(true);
    expect(out.every((r) => (r.sourceExcerpt?.length ?? 0) > 0)).toBe(true);
  });
});
