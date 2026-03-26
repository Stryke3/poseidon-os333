import { createHash } from "node:crypto";
import {
  EXTRACTION_CONFIDENCE,
  MANUAL_REQUIREMENT_CATEGORY,
  confidenceToFloat,
  mapCategoryToRequirementType,
} from "./governance.constants.js";

/** Normalized row for API preview and `ManualRequirement` insert. */
export type ExtractedRequirement = {
  requirementType: string;
  requirementKey: string;
  requirementValue: string;
  sourceExcerpt: string | null;
  confidence: number | null;
  hcpcsCode: string | null;
  diagnosisCode: string | null;
  deviceCategory: string | null;
};

/**
 * Verbatim contiguous substring from the manual: full line(s) containing the regex match
 * (no paraphrasing; suitable for audit / review UI).
 */
export function verbatimLineBlock(text: string, matchIndex: number, matchLen: number): string {
  const lineStart = text.lastIndexOf("\n", Math.max(0, matchIndex - 1)) + 1;
  const afterMatch = matchIndex + Math.max(matchLen, 1);
  const lineEndIdx = text.indexOf("\n", afterMatch);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  return text.slice(lineStart, lineEnd).trim() || text.slice(matchIndex, afterMatch).trim();
}

type Pattern = {
  category: string;
  re: RegExp;
  confidence: string;
  build: (
    match: RegExpMatchArray,
    text: string,
    idx: number,
  ) => {
    structured: Record<string, unknown>;
    sourceQuote: string;
    sourceStart: number | null;
    sourceEnd: number | null;
  };
};

const patterns: Pattern[] = [
  {
    category: MANUAL_REQUIREMENT_CATEGORY.REQUIRED_DOCUMENT,
    re: /\b(?:LMN|letter of medical necessity|medical necessity letter)\b/gi,
    confidence: EXTRACTION_CONFIDENCE.HIGH,
    build: (m, text, idx) => {
      const quote = verbatimLineBlock(text, idx, m[0]?.length ?? 0);
      return {
        structured: { kind: "LMN", phrase: m[0] },
        sourceQuote: quote,
        sourceStart: idx,
        sourceEnd: idx + (m[0]?.length ?? 0),
      };
    },
  },
  {
    category: MANUAL_REQUIREMENT_CATEGORY.REQUIRED_DOCUMENT,
    re: /\b(?:SWO|signed order|physician order|written order)\b/gi,
    confidence: EXTRACTION_CONFIDENCE.HIGH,
    build: (m, text, idx) => {
      const quote = verbatimLineBlock(text, idx, m[0]?.length ?? 0);
      return {
        structured: { kind: "ORDER", phrase: m[0] },
        sourceQuote: quote,
        sourceStart: idx,
        sourceEnd: idx + (m[0]?.length ?? 0),
      };
    },
  },
  {
    category: MANUAL_REQUIREMENT_CATEGORY.REQUIRED_DOCUMENT,
    re: /\b(?:clinical notes|progress notes|chart notes|office visit notes)\b/gi,
    confidence: EXTRACTION_CONFIDENCE.MEDIUM,
    build: (m, text, idx) => {
      const quote = verbatimLineBlock(text, idx, m[0]?.length ?? 0);
      return {
        structured: { kind: "CLINICAL_NOTES", phrase: m[0] },
        sourceQuote: quote,
        sourceStart: idx,
        sourceEnd: idx + (m[0]?.length ?? 0),
      };
    },
  },
  {
    category: MANUAL_REQUIREMENT_CATEGORY.AUTHORIZATION_REQUIREMENT,
    re: /\b(?:prior authorization|pre-?authorization|preauth|PA required|notification required)\b/gi,
    confidence: EXTRACTION_CONFIDENCE.HIGH,
    build: (m, text, idx) => {
      const quote = verbatimLineBlock(text, idx, m[0]?.length ?? 0);
      return {
        structured: { requirement: m[0] },
        sourceQuote: quote,
        sourceStart: idx,
        sourceEnd: idx + (m[0]?.length ?? 0),
      };
    },
  },
  {
    category: MANUAL_REQUIREMENT_CATEGORY.DIAGNOSIS_DEVICE_RESTRICTION,
    re: /\b(?:ICD-?10|diagnosis code|DX code|HCPCS|CPT|procedure code)\s*[:\s]+([A-Z0-9][A-Z0-9\-.]{2,10})/gi,
    confidence: EXTRACTION_CONFIDENCE.MEDIUM,
    build: (m, text, idx) => {
      const quote = verbatimLineBlock(text, idx, m[0]?.length ?? 0);
      return {
        structured: { codeHint: m[1]?.trim() ?? m[0], raw: m[0] },
        sourceQuote: quote,
        sourceStart: idx,
        sourceEnd: idx + (m[0]?.length ?? 0),
      };
    },
  },
  {
    category: MANUAL_REQUIREMENT_CATEGORY.TIMING_RULE,
    re: /\b(?:within|no later than|at least)\s+(\d+)\s+(?:business\s+)?(?:day|week|month)s?\b/gi,
    confidence: EXTRACTION_CONFIDENCE.MEDIUM,
    build: (m, text, idx) => {
      const quote = verbatimLineBlock(text, idx, m[0]?.length ?? 0);
      return {
        structured: { amount: Number(m[1]), windowText: m[0] },
        sourceQuote: quote,
        sourceStart: idx,
        sourceEnd: idx + (m[0]?.length ?? 0),
      };
    },
  },
  {
    category: MANUAL_REQUIREMENT_CATEGORY.ESCALATION,
    re: /\b(?:appeal|peer[- ]to[- ]peer|reconsideration|grievance|fair hearing)\b/gi,
    confidence: EXTRACTION_CONFIDENCE.MEDIUM,
    build: (m, text, idx) => {
      const quote = verbatimLineBlock(text, idx, m[0]?.length ?? 0);
      return {
        structured: { pathway: m[0] },
        sourceQuote: quote,
        sourceStart: idx,
        sourceEnd: idx + (m[0]?.length ?? 0),
      };
    },
  },
  {
    category: MANUAL_REQUIREMENT_CATEGORY.DOCUMENTATION_LANGUAGE,
    re: /\b(?:medical necessity|experimental|investigational|not medically necessary)\b/gi,
    confidence: EXTRACTION_CONFIDENCE.HIGH,
    build: (m, text, idx) => {
      const quote = verbatimLineBlock(text, idx, m[0]?.length ?? 0);
      return {
        structured: { phrase: m[0] },
        sourceQuote: quote,
        sourceStart: idx,
        sourceEnd: idx + (m[0]?.length ?? 0),
      };
    },
  },
  {
    category: MANUAL_REQUIREMENT_CATEGORY.SUBMISSION_LIMITATION,
    re: /\b(?:availity|portal|fax only|covermymeds|electronic submission|no telephone)\b/gi,
    confidence: EXTRACTION_CONFIDENCE.MEDIUM,
    build: (m, text, idx) => {
      const quote = verbatimLineBlock(text, idx, m[0]?.length ?? 0);
      return {
        structured: { channel: m[0] },
        sourceQuote: quote,
        sourceStart: idx,
        sourceEnd: idx + (m[0]?.length ?? 0),
      };
    },
  },
];

function stableKey(requirementType: string, structured: Record<string, unknown>, sourceStart: number | null): string {
  const basis = `${requirementType}:${JSON.stringify(structured)}:${sourceStart ?? 0}`;
  return `${requirementType}:${createHash("sha256").update(basis, "utf8").digest("hex").slice(0, 16)}`;
}

function codesFromRestriction(structured: Record<string, unknown>): {
  hcpcsCode: string | null;
  diagnosisCode: string | null;
} {
  const raw = String(structured.raw ?? "");
  const hint = String(structured.codeHint ?? "").trim();
  if (!hint) return { hcpcsCode: null, diagnosisCode: null };
  const upper = raw.toUpperCase();
  if (upper.includes("HCPCS") || upper.includes("CPT")) {
    return { hcpcsCode: hint, diagnosisCode: null };
  }
  if (upper.includes("ICD") || upper.includes("DX") || upper.includes("DIAGNOSIS")) {
    return { hcpcsCode: null, diagnosisCode: hint };
  }
  return { hcpcsCode: null, diagnosisCode: null };
}

export function checksumManualText(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Deterministic extraction: regex windows + quoted spans (no ML). Same input yields same output.
 */
export function extractRequirementsFromManualText(text: string): ExtractedRequirement[] {
  const out: ExtractedRequirement[] = [];
  const seen = new Set<string>();

  for (const p of patterns) {
    const re = new RegExp(p.re.source, p.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const idx = m.index;
      const built = p.build(m, text, idx);
      const requirementType = mapCategoryToRequirementType(p.category);
      const requirementKey = stableKey(requirementType, built.structured, built.sourceStart);
      const dedupe = `${requirementKey}:${built.sourceQuote.slice(0, 60)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      let hcpcsCode: string | null = null;
      let diagnosisCode: string | null = null;
      if (p.category === MANUAL_REQUIREMENT_CATEGORY.DIAGNOSIS_DEVICE_RESTRICTION) {
        const c = codesFromRestriction(built.structured);
        hcpcsCode = c.hcpcsCode;
        diagnosisCode = c.diagnosisCode;
      }

      out.push({
        requirementType,
        requirementKey,
        requirementValue: JSON.stringify(built.structured),
        sourceExcerpt: built.sourceQuote || null,
        confidence: confidenceToFloat(p.confidence),
        hcpcsCode,
        diagnosisCode,
        deviceCategory: null,
      });
    }
  }

  return out.sort((a, b) => a.requirementKey.localeCompare(b.requirementKey));
}
