import { describe, it, expect } from "vitest";
import { runDocumentPipeline } from "../src/modules/packet/pipeline/run-document-pipeline.js";
import { renderTemplate } from "../src/modules/packet/template-engine.js";
import { LMN_TEMPLATE } from "../src/modules/packet/templates/lmn-swo.js";

const sampleInput = {
  patient: { firstName: "A", lastName: "B", dob: "2000-01-01" },
  device: "Wheelchair",
  physician: { name: "Dr. X", npi: "111" },
};

describe("document pipeline (input → ML → modifier → output)", () => {
  it("produces variables including mlRoutingNote then renders", async () => {
    const { variables, scores } = await runDocumentPipeline("LMN", sampleInput, () => ({
      patientName: "A B",
      dob: "2000-01-01",
      diagnosis: "User-supplied diagnosis line only",
      device: "Wheelchair",
      clinicalJustification: "",
      limitations: "",
      failedTreatments: "",
      physicianName: "Dr. X",
      npi: "111",
    }));

    expect(scores.modelVersion).toBeDefined();
    expect(scores.riskBand).toMatch(/^(low|medium|high)$/);
    expect(variables.mlRoutingNote).toContain("[LMN]");
    expect(variables.mlRoutingNote).toContain("risk=");

    const text = renderTemplate(LMN_TEMPLATE.trim(), variables);
    expect(text).toContain("Wheelchair");
    expect(text).toContain("Non-clinical workflow");
    expect(text).toContain(variables.mlRoutingNote);
  });
});
