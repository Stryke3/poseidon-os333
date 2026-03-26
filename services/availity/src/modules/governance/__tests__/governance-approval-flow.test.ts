import { describe, expect, it, vi } from "vitest";
import { approveGovernanceRecommendation } from "../governance.decision.service.js";
import { GOVERNANCE_STATUS } from "../governance.constants.js";

describe("approveGovernanceRecommendation", () => {
  it("records decision and updates recommendation status", async () => {
    const prisma = {
      governanceRecommendation: {
        findUnique: vi.fn().mockResolvedValue({
          id: "rec_1",
          status: GOVERNANCE_STATUS.PENDING,
          recommendationType: "REVISE_PLAYBOOK",
          draftPayload: { playbookId: "pb_1" },
        }),
        update: vi.fn().mockResolvedValue({ id: "rec_1", status: GOVERNANCE_STATUS.APPROVED }),
      },
      governanceDecision: {
        create: vi.fn().mockResolvedValue({ id: "decision_1" }),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    } as any;

    const out = await approveGovernanceRecommendation(prisma, "rec_1", "admin@test", "looks good");
    expect(out.success).toBe(true);
    expect(prisma.governanceDecision.create).toHaveBeenCalled();
    expect(prisma.governanceRecommendation.update).toHaveBeenCalledWith({
      where: { id: "rec_1" },
      data: { status: GOVERNANCE_STATUS.APPROVED },
    });
  });
});

