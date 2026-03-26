import { describe, it, expect } from "vitest";
import type { Case } from "@prisma/client";
import {
  buildPacketGenerationSnapshot,
  hashSnapshot,
} from "../src/modules/packet/packet-snapshot.js";

const baseCase: Case = {
  id: "cl_case1",
  patientFirstName: "Pat",
  patientLastName: "One",
  dob: new Date("1988-06-15T00:00:00.000Z"),
  memberId: "M-100",
  payerId: "PAYER_X",
  status: "open",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
};

describe("buildPacketGenerationSnapshot", () => {
  it("joins diagnosis codes and echoes only user summary lines", () => {
    const snap = buildPacketGenerationSnapshot(baseCase, {
      diagnosis: [
        { code: "A", description: "entered text" },
        { code: "B" },
      ],
      device: { category: "brace" },
      physician: { name: "Dr. Who" },
      clinicalSummaryLines: ["Line one", "Line two"],
    });
    expect(snap.derived.diagnosisCodesJoined).toBe("A, B");
    expect(snap.derived.clinicalSummaryBlock).toBe("Line one\nLine two");
    expect(snap.case.memberId).toBe("M-100");
    expect(snap.payerRules?.profileId).toBeDefined();
  });

  it("uses explicit empty-state copy when no summary lines", () => {
    const snap = buildPacketGenerationSnapshot(baseCase, {
      diagnosis: [{ code: "Z" }],
      device: { category: "item" },
      physician: { name: "Dr. X" },
    });
    expect(snap.derived.clinicalSummaryBlock).toContain("No user-entered clinical summary");
  });
});

describe("hashSnapshot", () => {
  it("is stable for equivalent snapshots", () => {
    const clinical = {
      diagnosis: [{ code: "Z" }],
      device: { category: "item" },
      physician: { name: "Dr. X" },
    };
    const a = buildPacketGenerationSnapshot(baseCase, clinical);
    const b = buildPacketGenerationSnapshot(baseCase, clinical);
    expect(hashSnapshot(a)).toBe(hashSnapshot(b));
  });
});
