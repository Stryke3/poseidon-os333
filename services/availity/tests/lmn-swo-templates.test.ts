import { describe, it, expect } from "vitest";
import type { Case } from "@prisma/client";
import { LMN_TEMPLATE, SWO_TEMPLATE } from "../src/modules/packet/templates/lmn-swo.js";
import {
  renderTemplate,
  variablesForTemplate,
} from "../src/modules/packet/template-engine.js";
import {
  buildPacketGenerationSnapshot,
  snapshotToRenderContext,
} from "../src/modules/packet/packet-snapshot.js";

const mockCase: Case = {
  id: "c1",
  patientFirstName: "Pat",
  patientLastName: "One",
  dob: new Date("1990-03-20T00:00:00.000Z"),
  memberId: "M1",
  payerId: "P1",
  status: "open",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("LMN_TEMPLATE / SWO_TEMPLATE", () => {
  it("fills flat placeholders from snapshot context", () => {
    const snap = buildPacketGenerationSnapshot(mockCase, {
      diagnosis: [{ code: "M17.11", description: "OA" }],
      device: { category: "Knee orthosis", hcpcs: "L1832" },
      physician: { name: "Dr. Smith", npi: "1234567890" },
      clinicalJustification: "Pain and instability documented.",
      limitations: "Stairs difficult.",
      failedTreatments: "PT completed.",
      orderDate: "2025-06-01",
    });
    const ctx = snapshotToRenderContext(snap);
    const lmnBody = LMN_TEMPLATE.trim();
    const swoBody = SWO_TEMPLATE.trim();

    const lmn = renderTemplate(lmnBody, variablesForTemplate(lmnBody, ctx));
    expect(lmn).toContain("Pat One");
    expect(lmn).toContain("1990-03-20");
    expect(lmn).toContain("M17.11");
    expect(lmn).toContain("Knee orthosis");
    expect(lmn).toContain("Pain and instability documented.");
    expect(lmn).toContain("Dr. Smith");
    expect(lmn).toContain("1234567890");
    expect(lmn).toContain("Non-clinical workflow");

    const swo = renderTemplate(swoBody, variablesForTemplate(swoBody, ctx));
    expect(swo).toContain("L1832");
    expect(swo).toContain("2025-06-01");
    expect(swo).toContain("Signature Required");
    expect(swo).toContain("Non-clinical workflow");
  });
});
