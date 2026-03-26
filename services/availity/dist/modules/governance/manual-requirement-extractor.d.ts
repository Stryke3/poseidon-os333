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
export declare function verbatimLineBlock(text: string, matchIndex: number, matchLen: number): string;
export declare function checksumManualText(raw: string): string;
/**
 * Deterministic extraction: regex windows + quoted spans (no ML). Same input yields same output.
 */
export declare function extractRequirementsFromManualText(text: string): ExtractedRequirement[];
//# sourceMappingURL=manual-requirement-extractor.d.ts.map