"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.playbookMatchScore = playbookMatchScore;
exports.matchPlaybook = matchPlaybook;
exports.rankMatchingPlaybooks = rankMatchingPlaybooks;
exports.selectBestPlaybook = selectBestPlaybook;
function playbookMatchScore(p, input) {
    let score = 0;
    if (p.planName && p.planName === input.planName)
        score += 3;
    if (p.deviceCategory && p.deviceCategory === input.deviceCategory)
        score += 2;
    if (p.hcpcsCode && p.hcpcsCode === input.hcpcsCode)
        score += 4;
    if (p.diagnosisCode && p.diagnosisCode === input.diagnosisCode)
        score += 3;
    return score;
}
/**
 * Picks the active playbook for `input.payerId` with the highest additive match score.
 * Tie: first winning row in filter order (same as iterating candidates once).
 */
function matchPlaybook(playbooks, input) {
    const candidates = playbooks.filter((p) => p.payerId === input.payerId && p.active);
    let bestScore = -1;
    let bestMatch = null;
    for (const p of candidates) {
        const score = playbookMatchScore(p, input);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = p;
        }
    }
    return bestMatch;
}
function contextToMatchInput(ctx) {
    return {
        payerId: ctx.payerId,
        planName: ctx.planName,
        deviceCategory: ctx.deviceCategory,
        hcpcsCode: ctx.hcpcsCode,
        diagnosisCode: ctx.diagnosisCodes.map((c) => c.trim()).find(Boolean),
    };
}
/** Full ranking for APIs: score desc, then version desc, then id (deterministic). */
function rankMatchingPlaybooks(rows, ctx) {
    const input = contextToMatchInput(ctx);
    const candidates = rows.filter((p) => p.payerId === input.payerId && p.active);
    return [...candidates].sort((a, b) => {
        const sa = playbookMatchScore(a, input);
        const sb = playbookMatchScore(b, input);
        if (sb !== sa)
            return sb - sa;
        if (b.version !== a.version)
            return b.version - a.version;
        return a.id.localeCompare(b.id);
    });
}
function selectBestPlaybook(rows, ctx) {
    return matchPlaybook(rows, contextToMatchInput(ctx));
}
//# sourceMappingURL=playbook.matcher.js.map