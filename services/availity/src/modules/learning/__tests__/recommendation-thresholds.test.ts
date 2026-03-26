import { describe, expect, it, vi } from "vitest";
import { RecommendationEngineService } from "../recommendationEnginePlaybook.service.js";
import { GOVERNANCE_RECOMMENDATION_TYPE } from "../../governance/governance.constants.js";

describe("RecommendationEngineService thresholds", () => {
  it("does not create recommendation when sample size is too small", async () => {
    const db = {
      playbookPerformance: {
        findFirst: vi.fn().mockResolvedValue({
          id: "perf_1",
          playbookId: "pb_1",
          version: 1,
          payerId: "AETNA",
          totalCases: 9,
          approvals: 9,
          avgTurnaroundDays: 2,
        }),
      },
      governanceRecommendation: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
    } as any;
    const svc = new RecommendationEngineService(db);
    const rec = await svc.evaluatePlaybook("pb_1", 1);
    expect(rec).toBeNull();
    expect(db.governanceRecommendation.create).not.toHaveBeenCalled();
  });

  it("creates recommendation when threshold is met with evidence refs", async () => {
    const db = {
      playbookPerformance: {
        findFirst: vi.fn().mockResolvedValue({
          id: "perf_2",
          playbookId: "pb_2",
          version: 2,
          payerId: "AETNA",
          totalCases: 10,
          approvals: 9,
          avgTurnaroundDays: 3,
          denialReasons: {},
        }),
      },
      governanceRecommendation: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(async ({ data }) => ({ id: "rec_1", ...data })),
      },
    } as any;
    const svc = new RecommendationEngineService(db);
    const rec = await svc.evaluatePlaybook("pb_2", 2);
    expect(rec?.recommendationType).toBe(GOVERNANCE_RECOMMENDATION_TYPE.PROMOTE_PLAYBOOK);
    expect((rec?.evidence as any)?.references?.playbookPerformanceId).toBe("perf_2");
  });
});

