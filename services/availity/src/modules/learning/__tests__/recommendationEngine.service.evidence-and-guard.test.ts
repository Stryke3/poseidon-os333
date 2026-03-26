import { describe, expect, it, vi } from "vitest";
import { RecommendationEngineService } from "../recommendationEngine.service.js";
import {
  GOVERNANCE_RECOMMENDATION_TYPE,
  GOVERNANCE_STATUS,
  LEARNED_SUGGESTION_STATUS,
  LEARNED_SUGGESTION_TYPE,
  MANUAL_REQUIREMENT_REVIEW_STATE,
} from "../../governance/governance.constants.js";

describe("RecommendationEngineService invariants", () => {
  it("evaluatePlaybook includes evidence references + explainable policy", async () => {
    const db = {
      playbookPerformance: {
        findFirst: vi.fn().mockResolvedValue({
          id: "perf_1",
          playbookId: "pb_1",
          version: 1,
          payerId: "AETNA",
          totalCases: 10,
          approvals: 9,
          avgTurnaroundDays: 3,
          denialReasons: { x: 2 },
          calculatedAt: new Date(),
        }),
      },
      governanceRecommendation: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(async ({ data }: any) => ({
          id: "rec_1",
          ...data,
        })),
      },
      manualRequirement: {},
      learnedRuleSuggestion: {},
    } as any;

    const svc = new RecommendationEngineService(db);
    const out = await svc.evaluatePlaybook("pb_1", 1);

    expect(out?.recommendationType).toBe(GOVERNANCE_RECOMMENDATION_TYPE.PROMOTE_PLAYBOOK);
    expect(out?.status).toBe(GOVERNANCE_STATUS.PENDING);
    expect((out as any).evidence?.references?.playbookPerformanceId).toBe("perf_1");
    expect((out as any).evidence?.policy?.explainable).toBe(true);
    expect((out as any).evidence?.policy?.noAutoApply).toBe(true);
  });

  it("createRuleSuggestionFromOutcomes does not create suggestions when an approved manual exists", async () => {
    const db = {
      manualRequirement: {
        findFirst: vi.fn().mockResolvedValue({ id: "manual_req_approved" }),
      },
      learnedRuleSuggestion: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    } as any;

    const svc = new RecommendationEngineService(db);
    const out = await svc.createRuleSuggestionFromOutcomes({
      payerId: "AETNA",
      pattern: { planName: undefined, deviceCategory: undefined, hcpcsCode: undefined, diagnosisCode: undefined },
      repeatedDenialReason: "denial text",
      evidence: {},
    });

    expect(out).toBeNull();
    expect(db.learnedRuleSuggestion.create).not.toHaveBeenCalled();
  });
});

