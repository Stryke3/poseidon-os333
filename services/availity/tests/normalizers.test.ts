import { describe, it, expect } from "vitest";
import {
  normalizeEligibility,
  normalizeEligibilityResponse,
} from "../src/normalizers/eligibility.js";

describe("normalizeEligibilityResponse", () => {
  it("maps flat coverage fields without envelope unwrap", () => {
    const raw = {
      coverageActive: true,
      payerName: "Humana",
      memberId: "M1",
      planName: "Choice",
      deductible: "100",
      deductibleRemaining: "50.00",
      authRequired: true,
    };
    const r = normalizeEligibilityResponse(raw);
    expect(r.success).toBe(true);
    expect(r.coverageActive).toBe(true);
    expect(r.payerName).toBe("Humana");
    expect(r.memberId).toBe("M1");
    expect(r.planName).toBe("Choice");
    expect(r.deductible).toBe(100);
    expect(r.deductibleRemaining).toBe(50);
    expect(r.authRequired).toBe(true);
    expect(r.rawResponse).toBe(raw);
  });

  it("uses nested healthPlan and coverage paths", () => {
    const raw = {
      healthPlan: { name: "HP" },
      coverage: { active: false, planName: "PPO", authRequired: false },
      subscriber: { memberId: "SUB" },
    };
    const r = normalizeEligibilityResponse(raw);
    expect(r.payerName).toBe("HP");
    expect(r.coverageActive).toBe(false);
    expect(r.planName).toBe("PPO");
    expect(r.memberId).toBe("SUB");
    expect(r.authRequired).toBe(false);
  });
});

describe("normalizeEligibility", () => {
  it("returns empty result for null input", () => {
    const result = normalizeEligibility(null);
    expect(result.success).toBe(false);
    expect(result.coverageActive).toBeNull();
  });

  it("extracts fields from flat response", () => {
    const result = normalizeEligibility({
      coverageActive: true,
      payerName: "Aetna",
      memberId: "MEM123",
      planName: "Gold PPO",
      deductible: 1500,
      deductibleRemaining: 800,
      authRequired: false,
    });

    expect(result.success).toBe(true);
    expect(result.coverageActive).toBe(true);
    expect(result.payerName).toBe("Aetna");
    expect(result.memberId).toBe("MEM123");
    expect(result.planName).toBe("Gold PPO");
    expect(result.deductible).toBe(1500);
    expect(result.deductibleRemaining).toBe(800);
    expect(result.authRequired).toBe(false);
  });

  it("extracts from nested eligibility envelope", () => {
    const result = normalizeEligibility({
      eligibility: {
        coverageStatus: "active",
        payer: { name: "BCBS" },
        subscriberId: "SUB456",
        insurancePlanName: "Silver HMO",
        deductibleAmount: "2000",
        remainingDeductible: "1200.50",
        authorizationRequired: true,
      },
    });

    expect(result.coverageActive).toBe(true);
    expect(result.payerName).toBe("BCBS");
    expect(result.memberId).toBe("SUB456");
    expect(result.deductible).toBe(2000);
    expect(result.deductibleRemaining).toBe(1200.5);
    expect(result.authRequired).toBe(true);
  });

  it("extracts from coverages array envelope", () => {
    const result = normalizeEligibility({
      coverages: [
        {
          status: "1",
          payerName: "Cigna",
          memberId: "C789",
          plan: { name: "Basic" },
        },
      ],
    });

    expect(result.coverageActive).toBe(true);
    expect(result.payerName).toBe("Cigna");
    expect(result.planName).toBe("Basic");
  });

  it("preserves rawResponse", () => {
    const raw = { foo: "bar" };
    const result = normalizeEligibility(raw);
    expect(result.rawResponse).toBe(raw);
  });

  it("handles string deductible values", () => {
    const result = normalizeEligibility({
      deductible: "3500.00",
      deductibleRemaining: "invalid",
    });
    expect(result.coverageActive).toBeNull();
    expect(result.deductible).toBe(3500);
    expect(result.deductibleRemaining).toBe(null);
  });
});
