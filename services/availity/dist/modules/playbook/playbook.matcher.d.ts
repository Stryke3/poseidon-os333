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
export declare function playbookMatchScore(p: Pick<PayerPlaybook, "planName" | "deviceCategory" | "hcpcsCode" | "diagnosisCode">, input: PlaybookMatchInput): number;
/**
 * Picks the active playbook for `input.payerId` with the highest additive match score.
 * Tie: first winning row in filter order (same as iterating candidates once).
 */
export declare function matchPlaybook(playbooks: PayerPlaybook[], input: PlaybookMatchInput): PayerPlaybook | null;
/** Full ranking for APIs: score desc, then version desc, then id (deterministic). */
export declare function rankMatchingPlaybooks(rows: PayerPlaybook[], ctx: PlaybookMatchContext): PayerPlaybook[];
export declare function selectBestPlaybook(rows: PayerPlaybook[], ctx: PlaybookMatchContext): PayerPlaybook | null;
//# sourceMappingURL=playbook.matcher.d.ts.map