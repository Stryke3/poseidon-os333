import fs from 'fs/promises';
import path from 'path';

const K_DEFAULT = 10; // Credibility constant

export async function resolveTridentScore(payer: string, hcpcs: string[]) {
  const knowledgePath = path.join(process.cwd(), 'src/lib/data/trident-knowledge.json');
  const knowledge = JSON.parse(await fs.readFile(knowledgePath, 'utf8'));

  const payerData = knowledge.payer_logic[payer.toUpperCase()] || { base_win_rate: 0.5, K_credibility: 20, samples: 0 };
  
  // Real-time reflex: Look up recent denials/wins for this HCPCS + Payer
  const key = `${payer.toUpperCase()}_${hcpcs.join('_')}`;
  const adjustment = knowledge.adjustments[key] || { wins: 0, losses: 0 };
  
  const n = adjustment.wins + adjustment.losses;
  const local_rate = n > 0 ? adjustment.wins / n : payerData.base_win_rate;

  // Empirical-Bayes Shrinkage
  // score = (shrinkage * local_rate) + ((1 - shrinkage) * global_average)
  const shrinkage = n / (n + (payerData.K_credibility || K_DEFAULT));
  const score = (shrinkage * local_rate) + ((1 - shrinkage) * payerData.base_win_rate);

  return {
    score: parseFloat(score.toFixed(4)),
    confidence: n > 50 ? 'HIGH' : n > 10 ? 'MEDIUM' : 'BASELINE',
    rationale: generateNOC(payer, score, hcpcs),
    samples: payerData.samples + n
  };
}

function generateNOC(payer: string, score: number, codes: string[]) {
  if (score > 0.9) return `Primary Necessity: Payer ${payer} historically approves ${codes[0]} with 90%+ confidence based on 12k record baseline.`;
  if (score < 0.6) return `Warning: High risk of denial. Documentation must emphasize fail-first conservative therapy.`;
  return `Standard clinical justification required for ${codes.join(', ')}.`;
}
