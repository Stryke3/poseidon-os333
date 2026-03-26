import { describe, expect, it } from "vitest";
import {
  applyPayerBehaviorRules,
  buildDenialHistogram,
  computeDeterministicScore,
  computePayerScoreWorkflow,
  MIN_HISTORY_FOR_CONFIDENCE,
  payerRuleMatchesInput,
} from "../src/modules/payer-behavior/payerBehavior.rules.js";
import { aggregateAuthorizationOutcomes } from "../src/modules/payer-behavior/payerBehavior.stats.service.js";
import type {
  PayerBehaviorMatchedRule,
  PayerBehaviorStats,
  PayerRuleRecord,
  ScoreCaseInput,
  ScoreComputationInput,
} from "../src/modules/payer-behavior/payerBehavior.types.js";

const emptyStats = (): PayerBehaviorStats => ({
  total: 0,
  approved: 0,
  denied: 0,
  approvalRate: 0,
  topDenialReasons: [],
});

const baseInput = (): ScoreComputationInput => ({
  payerId: "PAYER1",
  diagnosisCodes: ["M17.11"],
  hasLmn: true,
  hasSwo: true,
  hasClinicals: true,
});

const baseCaseInput = (): ScoreCaseInput => ({
  payerId: "PAYER1",
  diagnosisCode: "M17.11",
  hasLmn: true,
  hasSwo: true,
  hasClinicals: true,
});

function baseRule(over: Partial<PayerRuleRecord> = {}): PayerRuleRecord {
  return {
    id: "r1",
    payerId: "PAYER1",
    planName: null,
    deviceCategory: null,
    hcpcsCode: null,
    diagnosisCode: null,
    requiresLmn: false,
    requiresSwo: false,
    requiresClinicals: false,
    requiresAuth: true,
    notes: null,
    active: true,
    ...over,
  };
}

function matchedFromFull(r: PayerRuleRecord): PayerBehaviorMatchedRule {
  return {
    payerId: r.payerId,
    planName: r.planName,
    deviceCategory: r.deviceCategory,
    hcpcsCode: r.hcpcsCode,
    diagnosisCode: r.diagnosisCode,
    requiresLmn: r.requiresLmn,
    requiresSwo: r.requiresSwo,
    requiresClinicals: r.requiresClinicals,
    requiresAuth: r.requiresAuth,
    notes: r.notes,
  };
}

describe("buildDenialHistogram", () => {
  it("returns empty object for no reasons", () => {
    expect(buildDenialHistogram([])).toEqual({});
    expect(buildDenialHistogram([null, null])).toEqual({});
  });

  it("aggregates and normalizes keys", () => {
    const h = buildDenialHistogram([
      "missing LMN",
      "missing LMN",
      null,
      "  peer review  ",
    ]);
    expect(h["missing LMN"]).toBe(2);
    expect(h["peer review"]).toBe(1);
  });
});

describe("aggregateAuthorizationOutcomes", () => {
  it("uses approved / total for approval rate and orders denial reasons", () => {
    const rows = [
      { outcome: "APPROVED" as const, denialReason: null },
      ...Array.from({ length: 7 }, () => ({
        outcome: "DENIED" as const,
        denialReason: "b" as string | null,
      })),
      ...Array.from({ length: 2 }, () => ({
        outcome: "DENIED" as const,
        denialReason: "a" as string | null,
      })),
    ];
    const s = aggregateAuthorizationOutcomes(rows);
    expect(s.total).toBe(10);
    expect(s.approved).toBe(1);
    expect(s.denied).toBe(9);
    expect(s.approvalRate).toBeCloseTo(0.1);
    expect(s.topDenialReasons[0]).toBe("b");
  });
});

describe("computePayerScoreWorkflow", () => {
  it("blocks when requirements missing before other gates", () => {
    expect(
      computePayerScoreWorkflow({
        missingRequirements: ["LMN"],
        riskLevel: "HIGH",
        recommendedAction: "HOLD_AND_COMPLETE_REQUIREMENTS",
      }),
    ).toEqual({
      blockSubmission: true,
      requiresManualReview: false,
      allowPacketSubmission: false,
    });
  });

  it("routes HIGH to manual review when nothing missing", () => {
    expect(
      computePayerScoreWorkflow({
        missingRequirements: [],
        riskLevel: "HIGH",
        recommendedAction: "REVIEW_BEFORE_SUBMISSION",
      }),
    ).toEqual({
      blockSubmission: false,
      requiresManualReview: true,
      allowPacketSubmission: false,
    });
  });

  it("allows packet path only on SUBMIT with no prior gates", () => {
    expect(
      computePayerScoreWorkflow({
        missingRequirements: [],
        riskLevel: "LOW",
        recommendedAction: "SUBMIT",
      }),
    ).toEqual({
      blockSubmission: false,
      requiresManualReview: false,
      allowPacketSubmission: true,
    });
  });
});

describe("applyPayerBehaviorRules", () => {
  it("applies sparse-history penalty when total < 5", () => {
    const stats: PayerBehaviorStats = {
      total: 2,
      approved: 1,
      denied: 1,
      approvalRate: 0.5,
      topDenialReasons: [],
    };
    const out = applyPayerBehaviorRules(baseCaseInput(), [], stats);
    expect(out.approvalProbability).toBe(65);
    expect(out.explanation.some((e) => e.message.includes("Limited payer history"))).toBe(true);
  });

  it("flags missing LMN and sets HOLD action", () => {
    const rule: PayerBehaviorMatchedRule = {
      payerId: "PAYER1",
      requiresLmn: true,
      requiresSwo: false,
      requiresClinicals: false,
      requiresAuth: true,
    };
    const stats: PayerBehaviorStats = {
      total: 10,
      approved: 5,
      denied: 5,
      approvalRate: 0.5,
      topDenialReasons: [],
    };
    const out = applyPayerBehaviorRules({ ...baseCaseInput(), hasLmn: false }, [rule], stats);
    expect(out.missingRequirements).toContain("LMN");
    expect(out.predictedDenialReasons).toContain("Missing LMN");
    expect(out.recommendedAction).toBe("HOLD_AND_COMPLETE_REQUIREMENTS");
    expect(out.approvalProbability).toBe(55);
    expect(out.workflow).toEqual({
      blockSubmission: true,
      requiresManualReview: false,
      allowPacketSubmission: false,
    });
  });
});

describe("payerRuleMatchesInput", () => {
  it("matches when scope fields are null", () => {
    expect(payerRuleMatchesInput(baseRule(), baseInput())).toBe(true);
  });

  it("requires planName when rule specifies it", () => {
    const r = baseRule({ planName: "Gold" });
    expect(payerRuleMatchesInput(r, { ...baseInput(), planName: "Gold" })).toBe(true);
    expect(payerRuleMatchesInput(r, baseInput())).toBe(false);
  });

  it("matches hcpcs when rule specifies code", () => {
    const r = baseRule({ hcpcsCode: "L1832" });
    expect(payerRuleMatchesInput(r, { ...baseInput(), hcpcsCode: "l1832" })).toBe(true);
    expect(payerRuleMatchesInput(r, baseInput())).toBe(false);
  });
});

describe("computeDeterministicScore", () => {
  it("uses limited-history path when total < 5", () => {
    const stats = emptyStats();
    stats.total = MIN_HISTORY_FOR_CONFIDENCE - 1;
    const { score, confidenceNote } = computeDeterministicScore({
      input: baseInput(),
      stats,
      rules: [],
    });
    expect(score.approvalProbability).toBe(65);
    expect(confidenceNote).toContain("Limited payer history");
    expect(
      score.explanation.some((e) => e.type === "HISTORY" && e.message.includes("Limited payer history")),
    ).toBe(true);
  });

  it("flags requiresLmn when LMN absent and holds submission", () => {
    const rule = baseRule({ requiresLmn: true, notes: "Payer needs LMN." });
    const input = { ...baseInput(), hasLmn: false };
    const stats: PayerBehaviorStats = {
      total: 20,
      approved: 10,
      denied: 10,
      approvalRate: 0.5,
      topDenialReasons: [],
    };
    const { score, blockSubmission } = computeDeterministicScore({
      input,
      stats,
      rules: [rule],
    });
    expect(score.missingRequirements).toContain("LMN");
    expect(blockSubmission).toBe(true);
    expect(score.recommendedAction).toBe("HOLD_AND_COMPLETE_REQUIREMENTS");
    expect(score.explanation.some((e) => e.type === "RULE")).toBe(true);
  });

  it("penalizes low historical approval rate", () => {
    const stats: PayerBehaviorStats = {
      total: 30,
      approved: 3,
      denied: 27,
      approvalRate: 0.1,
      topDenialReasons: ["not medically necessary"],
    };
    const { score } = computeDeterministicScore({
      input: baseInput(),
      stats,
      rules: [],
    });
    expect(score.approvalProbability).toBe(55);
    expect(score.riskLevel).toBe("MEDIUM");
    expect(score.predictedDenialReasons).toContain("not medically necessary");
  });

  it("requires clinicals when rule matches and flag off", () => {
    const rule = baseRule({ requiresClinicals: true });
    const input = { ...baseInput(), hasClinicals: false };
    const stats: PayerBehaviorStats = {
      total: 20,
      approved: 12,
      denied: 8,
      approvalRate: 0.6,
      topDenialReasons: [],
    };
    const { score, blockSubmission } = computeDeterministicScore({
      input,
      stats,
      rules: [rule],
    });
    expect(score.missingRequirements).toContain("Clinical documentation");
    expect(blockSubmission).toBe(true);
    expect(score.approvalProbability).toBe(60);
  });

  it("only applies rules that match scope (hcpcs)", () => {
    const rule = baseRule({
      id: "scoped",
      hcpcsCode: "L1832",
      requiresLmn: true,
    });
    const input = { ...baseInput(), hcpcsCode: "K0001", hasLmn: false };
    const stats: PayerBehaviorStats = {
      total: 20,
      approved: 10,
      denied: 10,
      approvalRate: 0.5,
      topDenialReasons: [],
    };
    const { score, blockSubmission } = computeDeterministicScore({
      input,
      stats,
      rules: [rule],
    });
    expect(score.missingRequirements.filter((m) => m === "LMN").length).toBe(0);
    expect(blockSubmission).toBe(false);
    expect(score.approvalProbability).toBe(75);
  });

  it("merges multiple matched rules for same payer", () => {
    const r1 = matchedFromFull(baseRule({ id: "a", requiresLmn: true, requiresSwo: false }));
    const r2 = matchedFromFull(baseRule({ id: "b", requiresLmn: false, requiresSwo: true }));
    const stats: PayerBehaviorStats = {
      total: 10,
      approved: 9,
      denied: 1,
      approvalRate: 0.9,
      topDenialReasons: [],
    };
    const out = applyPayerBehaviorRules(
      { ...baseCaseInput(), hasLmn: false, hasSwo: false },
      [r1, r2],
      stats,
    );
    expect(out.missingRequirements.sort()).toEqual(["LMN", "SWO"]);
    expect(out.approvalProbability).toBe(45);
    expect(out.riskLevel).toBe("HIGH");
  });
});
