import { describe, expect, it, vi } from "vitest";
import { ingestPayerManual } from "../manualIngestion.service.js";

describe("ingestPayerManual duplicate prevention", () => {
  it("returns existing manual when duplicate scope is found", async () => {
    const prisma = {
      payerManual: {
        findFirst: vi.fn().mockResolvedValue({ id: "manual_existing" }),
        create: vi.fn(),
      },
      manualRequirement: {
        count: vi.fn().mockResolvedValue(4),
      },
    } as any;

    const out = await ingestPayerManual(
      prisma,
      {
        payerId: "AETNA",
        planName: "COMM",
        rawText: "LMN is required for this request.",
        title: "Policy A",
      },
      "test-user",
    );

    expect(out.manualId).toBe("manual_existing");
    expect(out.requirementsCount).toBe(4);
    expect(prisma.payerManual.create).not.toHaveBeenCalled();
  });
});

