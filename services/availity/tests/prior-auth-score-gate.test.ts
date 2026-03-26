import { describe, expect, it, vi } from "vitest";
import {
  buildScorePriorAuthBodyFromPacket,
  classifyPriorAuthScoreGate,
  payerScoreSnapshotToResult,
} from "../src/modules/packet/prior-auth-score-gate.js";
import type { ScoreCaseResult } from "../src/modules/payer-behavior/payerBehavior.types.js";

function scoreFixture(over: Partial<ScoreCaseResult>): ScoreCaseResult {
  return {
    approvalProbability: 80,
    riskLevel: "LOW",
    predictedDenialReasons: [],
    missingRequirements: [],
    recommendedAction: "SUBMIT",
    explanation: [],
    workflow: {
      blockSubmission: false,
      requiresManualReview: false,
      allowPacketSubmission: true,
    },
    ...over,
  };
}

describe("classifyPriorAuthScoreGate", () => {
  it("blocks submission when requirements are missing (e.g. LMN)", () => {
    const score = scoreFixture({
      missingRequirements: ["LMN"],
      recommendedAction: "HOLD_AND_COMPLETE_REQUIREMENTS",
      workflow: {
        blockSubmission: true,
        requiresManualReview: false,
        allowPacketSubmission: false,
      },
    });
    expect(classifyPriorAuthScoreGate("snap_lm", score).kind).toBe("BLOCKED");
  });

  it("routes to manual review when risk is HIGH", () => {
    const score = scoreFixture({
      approvalProbability: 40,
      riskLevel: "HIGH",
      recommendedAction: "REVIEW_BEFORE_SUBMISSION",
      workflow: {
        blockSubmission: false,
        requiresManualReview: true,
        allowPacketSubmission: false,
      },
    });
    expect(classifyPriorAuthScoreGate("snap_hi", score).kind).toBe("NEEDS_REVIEW");
  });

  it("allows Availity submission when score passes", () => {
    const score = scoreFixture({});
    expect(classifyPriorAuthScoreGate("snap_ok", score).kind).toBe("ALLOW_SUBMIT");
  });
});

describe("buildScorePriorAuthBodyFromPacket", () => {
  it("pulls diagnosis and device from document inputSnapshot", async () => {
    const prismaMock = {
      priorAuthPacket: {
        findUnique: vi.fn().mockResolvedValue({
          id: "pkt1",
          caseId: "case1",
          documents: { documentIds: ["d1"] },
          payload: {},
        }),
      },
      case: {
        findUnique: vi.fn().mockResolvedValue({
          id: "case1",
          payerId: "PAYER_X",
        }),
      },
      priorAuthDocument: {
        findMany: vi.fn().mockResolvedValue([
          {
            inputSnapshot: {
              case: { payerId: "PAYER_X" },
              clinical: {
                diagnosis: [{ code: "M17.11" }],
                device: { category: "Knee brace", hcpcs: "L1832" },
                physician: { name: "Dr. A" },
              },
            },
          },
        ]),
      },
    };

    const body = await buildScorePriorAuthBodyFromPacket(prismaMock as never, "pkt1");
    expect(body.packetId).toBe("pkt1");
    expect(body.payerId).toBe("PAYER_X");
    expect(body.diagnosisCode).toBe("M17.11");
    expect(body.hcpcsCode).toBe("L1832");
    expect(body.deviceCategory).toBe("Knee brace");
  });
});

describe("payerScoreSnapshotToResult", () => {
  it("recomputes workflow from persisted snapshot fields", () => {
    const row = {
      approvalProbability: 30,
      riskLevel: "HIGH",
      predictedDenialReasons: [],
      missingRequirements: [],
      recommendedAction: "REVIEW_BEFORE_SUBMISSION",
      explanation: [],
    };
    const r = payerScoreSnapshotToResult(row);
    expect(r.workflow.requiresManualReview).toBe(true);
    expect(r.riskLevel).toBe("HIGH");
  });
});
