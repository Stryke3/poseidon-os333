import { describe, expect, it } from "vitest";
import type { PayerPlaybook } from "@prisma/client";
import {
  matchPlaybook,
  playbookMatchScore,
  rankMatchingPlaybooks,
  selectBestPlaybook,
} from "../src/modules/playbook/playbook.matcher.js";
import type { PlaybookMatchContext } from "../src/modules/playbook/playbook.types.js";

function pb(
  overrides: Partial<PayerPlaybook> & Pick<PayerPlaybook, "id" | "payerId">,
): PayerPlaybook {
  return {
    planName: null,
    deviceCategory: null,
    hcpcsCode: null,
    diagnosisCode: null,
    strategy: {},
    documentRules: {},
    escalationRules: {},
    version: 1,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PayerPlaybook;
}

describe("playbook.matcher", () => {
  const input = {
    payerId: "P1",
    planName: "Gold",
    deviceCategory: "Knee orthosis",
    hcpcsCode: "L1832",
    diagnosisCode: "M17.11",
  };

  const ctx: PlaybookMatchContext = {
    payerId: "P1",
    planName: "Gold",
    deviceCategory: "Knee orthosis",
    hcpcsCode: "L1832",
    diagnosisCodes: ["M17.11"],
  };

  it("scores exact dimension hits", () => {
    const p = pb({
      id: "x",
      payerId: "P1",
      planName: "Gold",
      deviceCategory: "Knee orthosis",
      hcpcsCode: "L1832",
      diagnosisCode: "M17.11",
    });
    expect(playbookMatchScore(p, input)).toBe(3 + 2 + 4 + 3);
  });

  it("matchPlaybook ignores wrong payer", () => {
    expect(
      matchPlaybook([pb({ id: "a", payerId: "P2" })], input),
    ).toBeNull();
  });

  it("picks highest additive score", () => {
    const rows = [
      pb({
        id: "wild",
        payerId: "P1",
        version: 2,
      }),
      pb({
        id: "specific",
        payerId: "P1",
        planName: "Gold",
        hcpcsCode: "L1832",
        version: 1,
      }),
    ];
    expect(matchPlaybook(rows, input)?.id).toBe("specific");
    expect(selectBestPlaybook(rows, ctx)?.id).toBe("specific");
  });

  it("rankMatchingPlaybooks breaks score ties by version desc then id", () => {
    const rows = [
      pb({
        id: "b",
        payerId: "P1",
        hcpcsCode: "L1832",
        version: 1,
      }),
      pb({
        id: "a",
        payerId: "P1",
        hcpcsCode: "L1832",
        version: 2,
      }),
    ];
    const ranked = rankMatchingPlaybooks(rows, ctx);
    expect(ranked[0]?.id).toBe("a");
  });

  it("matchPlaybook tie keeps earlier candidate in iteration order", () => {
    const rows = [
      pb({ id: "first", payerId: "P1", hcpcsCode: "L1832", version: 1 }),
      pb({ id: "second", payerId: "P1", hcpcsCode: "L1832", version: 99 }),
    ];
    expect(matchPlaybook(rows, input)?.id).toBe("first");
  });
});
