import { describe, it, expect } from "vitest";
import { TEXT_NOT_SUPPLIED_BY_USER } from "../src/modules/packet/compliance.js";
import { renderTemplate } from "../src/modules/packet/template-engine.js";
import { LMN_TEMPLATE } from "../src/modules/packet/templates/lmn-swo.js";

describe("clinical traceability markers", () => {
  it("LMN diagnosis slot can show explicit not-supplied marker without inferring ICD", () => {
    const vars = {
      patientName: "X Y",
      dob: "1990-01-01",
      diagnosis: TEXT_NOT_SUPPLIED_BY_USER,
      device: "Brace",
      clinicalJustification: "",
      limitations: "",
      failedTreatments: "",
      physicianName: "Dr. Z",
      npi: "",
      mlRoutingNote: "",
    };
    const text = renderTemplate(LMN_TEMPLATE.trim(), vars);
    expect(text).toContain(TEXT_NOT_SUPPLIED_BY_USER);
    expect(text).toContain("user-entered");
  });
});
