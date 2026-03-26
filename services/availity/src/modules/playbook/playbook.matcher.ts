import type { PayerPlaybook } from "@prisma/client";
import type { PlaybookMatchContext } from "./playbook.types.js";

/** Input slice used for weighted playbook matching (scores are additive on exact field hits). */
export type PlaybookMatchInput = {
  payerId: string;
  planName?: string;
  deviceCategory?: string;
  hcpcsCode?: string;
  diagnosisCode?: string;
};

export function playbookMatchScore(
  p: Pick<
    PayerPlaybook,
    "planName" | "deviceCategory" | "hcpcsCode" | "diagnosisCode"
  >,
  input: PlaybookMatchInput,
): number {
  let score = 0;
  if (p.planName && p.planName === input.planName) score += 3;
  if (p.deviceCategory && p.deviceCategory === input.deviceCategory) score += 2;
  if (p.hcpcsCode && p.hcpcsCode === input.hcpcsCode) score += 4;
  if (p.diagnosisCode && p.diagnosisCode === input.diagnosisCode) score += 3;
  return score;
}

/**
 * Picks the active playbook for `input.payerId` with the highest additive match score.
 * Tie: first winning row in filter order (same as iterating candidates once).
 */
export function matchPlaybook(
  playbooks: PayerPlaybook[],
  input: PlaybookMatchInput,
): PayerPlaybook | null {
  const candidates = playbooks.filter((p) => p.payerId === input.payerId && p.active);

  let bestScore = -1;
  let bestMatch: PayerPlaybook | null = null;

  for (const p of candidates) {
    const score = playbookMatchScore(p, input);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = p;
    }
  }

  return bestMatch;
}

function contextToMatchInput(ctx: PlaybookMatchContext): PlaybookMatchInput {
  return {
    payerId: ctx.payerId,
    planName: ctx.planName,
    deviceCategory: ctx.deviceCategory,
    hcpcsCode: ctx.hcpcsCode,
    diagnosisCode: ctx.diagnosisCodes.map((c) => c.trim()).find(Boolean),
  };
}

/** Full ranking for APIs: score desc, then version desc, then id (deterministic). */
export function rankMatchingPlaybooks(
  rows: PayerPlaybook[],
  ctx: PlaybookMatchContext,
): PayerPlaybook[] {
  const input = contextToMatchInput(ctx);
  const candidates = rows.filter((p) => p.payerId === input.payerId && p.active);
  return [...candidates].sort((a, b) => {
    const sa = playbookMatchScore(a, input);
    const sb = playbookMatchScore(b, input);
    if (sb !== sa) return sb - sa;
    if (b.version !== a.version) return b.version - a.version;
    return a.id.localeCompare(b.id);
  });
}

export function selectBestPlaybook(
  rows: PayerPlaybook[],
  ctx: PlaybookMatchContext,
): PayerPlaybook | null {
  return matchPlaybook(rows, contextToMatchInput(ctx));
}
