import { describe, expect, it, vi } from "vitest";
import { persistManualRequirementExtractions } from "../manualRequirementExtraction.service.js";
import { MANUAL_REQUIREMENT_REVIEW_STATE } from "../../governance/governance.constants.js";

describe("persistManualRequirementExtractions", () => {
  it("deletes only non-approved rows and persists extracted candidates", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { manualRequirement: { deleteMany, createMany } };
    const prisma = {
      $transaction: vi.fn(async (fn: (trx: typeof tx) => Promise<void>) => fn(tx)),
    } as any;

    const out = await persistManualRequirementExtractions(
      prisma,
      "manual_1",
      "AETNA",
      null,
      "Prior authorization required. Submit LMN.",
      { useLlm: false, reviewOnly: true },
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        manualId: "manual_1",
        reviewState: { notIn: [MANUAL_REQUIREMENT_REVIEW_STATE.APPROVED, MANUAL_REQUIREMENT_REVIEW_STATE.REJECTED] },
      },
    });
    expect(createMany).toHaveBeenCalled();
    const createData = createMany.mock.calls[0]?.[0]?.data ?? [];
    expect(createData.length).toBeGreaterThan(0);
    expect(createData.every((r: any) => typeof r.sourceExcerpt === "string" && r.sourceExcerpt.length > 0)).toBe(true);
    expect(createData.every((r: any) => r.reviewState === MANUAL_REQUIREMENT_REVIEW_STATE.PENDING_REVIEW)).toBe(true);
    expect(createData.every((r: any) => r.active === false)).toBe(true);
    expect(out.created).toBeGreaterThan(0);
  });
});

